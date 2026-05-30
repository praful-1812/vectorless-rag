"""File ingestion: MarkItDown parsing + LLM tree building."""

import asyncio
import logging
import re
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.db.models import File, TreeNode, TreeNodeLevel
from app.services.llm import summarize_text

logger = logging.getLogger(__name__)

# Create a separate engine for background tasks
_engine = create_async_engine(settings.DATABASE_URL)
_session_factory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


async def ingest_file(file_id: int):
    """Background task: parse file with MarkItDown, chunk, build tree."""
    logger.info(f"[Ingestion] Starting ingestion for file_id={file_id}")

    async with _session_factory() as db:
        result = await db.execute(select(File).where(File.id == file_id))
        db_file = result.scalar_one_or_none()
        if not db_file:
            logger.error(f"[Ingestion] File not found in DB: file_id={file_id}")
            return

        logger.info(f"[Ingestion] File: '{db_file.name}' ({db_file.file_type}, {db_file.size} bytes)")

        # Step 1: Convert file to Markdown using MarkItDown
        try:
            logger.info(f"[Ingestion] Step 1/3: Converting to Markdown via MarkItDown...")
            markdown_content = await convert_to_markdown(db_file.storage_path)
            db_file.markdown_content = markdown_content
            logger.info(f"[Ingestion] ✓ Markdown conversion complete. Length: {len(markdown_content)} chars")
            logger.debug(f"[Ingestion] First 200 chars: {markdown_content[:200]}")
        except Exception as e:
            logger.error(f"[Ingestion] ✗ MarkItDown conversion FAILED: {e}")
            return

        # Step 2: Chunk by markdown structure
        logger.info(f"[Ingestion] Step 2/3: Chunking markdown by structure...")
        chunks = chunk_markdown(markdown_content)
        logger.info(f"[Ingestion] ✓ Created {len(chunks)} chunks")
        for i, chunk in enumerate(chunks):
            logger.debug(f"[Ingestion]   Chunk {i}: '{chunk['source_location']}' ({len(chunk['content'])} chars)")

        # Step 3: Build tree (leaves → branches → root)
        try:
            logger.info(f"[Ingestion] Step 3/3: Building LLM summary tree...")
            logger.info(f"[Ingestion]   This requires LLM calls to summarize chunks into branches and root.")
            logger.info(f"[Ingestion]   If no LLM API key is configured, this step will fail.")
            await build_tree(db, db_file.id, chunks)
            db_file.tree_built = True
            await db.commit()
            logger.info(f"[Ingestion] ✓ Tree built successfully for '{db_file.name}'!")
        except Exception as e:
            logger.error(f"[Ingestion] ✗ Tree building FAILED: {e}")
            logger.error(f"[Ingestion]   Make sure you have an LLM API key set.")
            logger.error(f"[Ingestion]   Supported env vars: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY")
            logger.error(f"[Ingestion]   Or use Ollama locally (no key needed): set model to 'ollama/llama3'")
            # Still save the markdown even if tree fails
            await db.commit()


async def convert_to_markdown(file_path: str) -> str:
    """Convert any file to Markdown using MarkItDown."""
    logger.info(f"[MarkItDown] Converting: {file_path}")

    def _convert():
        from markitdown import MarkItDown
        md = MarkItDown()
        result = md.convert(file_path)
        return result.text_content

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _convert)


def chunk_markdown(markdown: str) -> list[dict]:
    """Split markdown into chunks by headings/sections."""
    chunks = []
    # Split by headings (## or ###)
    sections = re.split(r'(?=^#{1,3}\s)', markdown, flags=re.MULTILINE)

    for i, section in enumerate(sections):
        section = section.strip()
        if not section:
            continue

        # Extract heading as source location
        lines = section.split('\n', 1)
        heading = lines[0].strip('#').strip() if lines[0].startswith('#') else f"Section {i + 1}"

        chunks.append({
            "content": section,
            "source_location": heading,
            "order_index": i,
        })

    # If no headings found, split by paragraphs (every ~500 chars)
    if len(chunks) <= 1 and len(markdown) > 500:
        chunks = []
        paragraphs = markdown.split('\n\n')
        current_chunk = ""
        chunk_idx = 0

        for para in paragraphs:
            if len(current_chunk) + len(para) > 500 and current_chunk:
                chunks.append({
                    "content": current_chunk.strip(),
                    "source_location": f"Paragraph {chunk_idx + 1}",
                    "order_index": chunk_idx,
                })
                chunk_idx += 1
                current_chunk = para
            else:
                current_chunk += "\n\n" + para

        if current_chunk.strip():
            chunks.append({
                "content": current_chunk.strip(),
                "source_location": f"Paragraph {chunk_idx + 1}",
                "order_index": chunk_idx,
            })

    return chunks


async def build_tree(db: AsyncSession, file_id: int, chunks: list[dict]):
    """Build LLM summary tree from chunks: leaves → branches → root."""

    # Step 1: Create leaf nodes
    logger.info(f"[Tree] Creating {len(chunks)} leaf nodes...")
    leaf_nodes = []
    for chunk in chunks:
        node = TreeNode(
            file_id=file_id,
            parent_id=None,
            level=TreeNodeLevel.LEAF,
            content=chunk["content"],
            source_location=chunk["source_location"],
            order_index=chunk["order_index"],
        )
        db.add(node)
        leaf_nodes.append(node)

    await db.flush()  # Get IDs for leaves
    logger.info(f"[Tree] ✓ {len(leaf_nodes)} leaf nodes created")

    # Step 2: Group leaves into branches (groups of 3-5)
    GROUP_SIZE = 4
    branch_nodes = []
    num_groups = (len(leaf_nodes) + GROUP_SIZE - 1) // GROUP_SIZE
    logger.info(f"[Tree] Creating {num_groups} branch nodes (groups of {GROUP_SIZE} leaves)...")

    for i in range(0, len(leaf_nodes), GROUP_SIZE):
        group = leaf_nodes[i:i + GROUP_SIZE]
        combined_text = "\n\n".join(n.content for n in group)
        group_idx = i // GROUP_SIZE

        logger.info(f"[Tree]   Branch {group_idx + 1}/{num_groups}: Summarizing {len(group)} leaves ({len(combined_text)} chars)...")
        logger.info(f"[Tree]   → Calling LLM to summarize...")

        # LLM summarizes the group
        summary = await summarize_text(
            combined_text,
            instruction="Summarize this section concisely. Preserve key facts, names, numbers.",
        )
        logger.info(f"[Tree]   ✓ Branch summary: '{summary[:80]}...'")

        branch = TreeNode(
            file_id=file_id,
            parent_id=None,
            level=TreeNodeLevel.BRANCH,
            content=summary,
            source_location=f"Sections {group[0].source_location} – {group[-1].source_location}",
            order_index=group_idx,
        )
        db.add(branch)
        await db.flush()

        # Link leaves to branch
        for leaf in group:
            leaf.parent_id = branch.id

        branch_nodes.append(branch)

    logger.info(f"[Tree] ✓ {len(branch_nodes)} branch nodes created")

    # Step 3: Create root node (summary of all branches)
    if branch_nodes:
        all_branch_text = "\n\n".join(n.content for n in branch_nodes)
        logger.info(f"[Tree] Creating root node: Summarizing {len(branch_nodes)} branches ({len(all_branch_text)} chars)...")
        logger.info(f"[Tree] → Calling LLM for document-level summary...")

        root_summary = await summarize_text(
            all_branch_text,
            instruction="Provide a high-level summary of this entire document. What topics does it cover?",
        )
        logger.info(f"[Tree] ✓ Root summary: '{root_summary[:100]}...'")

        root = TreeNode(
            file_id=file_id,
            parent_id=None,
            level=TreeNodeLevel.ROOT,
            content=root_summary,
            source_location="Document root",
            order_index=0,
        )
        db.add(root)
        await db.flush()

        # Link branches to root
        for branch in branch_nodes:
            branch.parent_id = root.id

    await db.flush()
    logger.info(f"[Tree] ✓ Tree complete: {len(leaf_nodes)} leaves → {len(branch_nodes)} branches → 1 root")
