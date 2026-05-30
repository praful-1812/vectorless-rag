"""Tree RAG retrieval: traverse tree top-down using LLM."""

import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import TreeNode, TreeNodeLevel, File
from app.services.llm import llm_select_branches

logger = logging.getLogger(__name__)


async def retrieve_passages(
    user_id: int,
    file_ids: list[int],
    query: str,
    model: str | None,
    db: AsyncSession,
) -> tuple[list[dict], list[int]]:
    """
    Traverse the tree for each selected file to find relevant leaf chunks.
    Returns (passages, traversal_path).
    """
    all_passages = []
    traversal_path = []

    logger.info(f"[Retrieval] Query: '{query[:60]}...' | files filter: {file_ids or 'all'}")

    # Get root nodes for selected files
    file_filter = [File.user_id == user_id]
    if file_ids:
        file_filter.append(File.id.in_(file_ids))

    result = await db.execute(select(File).where(*file_filter, File.tree_built == True))
    files = result.scalars().all()
    logger.info(f"[Retrieval] Found {len(files)} files with trees built")

    for file in files:
        # Get root node
        result = await db.execute(
            select(TreeNode).where(
                TreeNode.file_id == file.id,
                TreeNode.level == TreeNodeLevel.ROOT,
            )
        )
        root = result.scalar_one_or_none()
        if not root:
            continue

        # Traverse: root → branches → leaves
        passages, path = await _traverse_tree(db, root, query, model)
        all_passages.extend(passages)
        traversal_path.extend(path)

    return all_passages, traversal_path


async def _traverse_tree(
    db: AsyncSession,
    root: TreeNode,
    query: str,
    model: str | None,
) -> tuple[list[dict], list[int]]:
    """LLM-guided tree traversal from root to relevant leaves."""
    logger.info(f"[Retrieval] Traversing tree from root node {root.id}")
    traversal_path = [root.id]

    # Get branches (children of root)
    result = await db.execute(
        select(TreeNode).where(
            TreeNode.parent_id == root.id,
            TreeNode.level == TreeNodeLevel.BRANCH,
        ).order_by(TreeNode.order_index)
    )
    branches = result.scalars().all()

    if not branches:
        # No branches, root might directly have leaves
        logger.info("[Retrieval] No branches found, checking for direct leaves")
        result = await db.execute(
            select(TreeNode).where(
                TreeNode.parent_id == root.id,
                TreeNode.level == TreeNodeLevel.LEAF,
            )
        )
        leaves = result.scalars().all()
        return [_node_to_passage(l) for l in leaves], traversal_path

    # LLM decides which branches are relevant
    # If only 1 branch, skip LLM and use it directly
    if len(branches) == 1:
        logger.info("[Retrieval] Only 1 branch, using it directly (skipping LLM selection)")
        relevant_branch_ids = [branches[0].id]
    else:
        logger.info(f"[Retrieval] Asking LLM to select from {len(branches)} branches")
        relevant_branch_ids = await llm_select_branches(
            query=query,
            branches=[{"id": b.id, "summary": b.content, "location": b.source_location} for b in branches],
            model=model,
        )
    traversal_path.extend(relevant_branch_ids)

    # Get leaves from relevant branches
    passages = []
    for branch_id in relevant_branch_ids:
        result = await db.execute(
            select(TreeNode).where(
                TreeNode.parent_id == branch_id,
                TreeNode.level == TreeNodeLevel.LEAF,
            ).order_by(TreeNode.order_index)
        )
        leaves = result.scalars().all()
        passages.extend([_node_to_passage(l) for l in leaves])

    logger.info(f"[Retrieval] ✓ Retrieved {len(passages)} passages from {len(relevant_branch_ids)} branches")
    return passages, traversal_path


def _node_to_passage(node: TreeNode) -> dict:
    return {
        "node_id": node.id,
        "content": node.content,
        "source_location": node.source_location,
    }
