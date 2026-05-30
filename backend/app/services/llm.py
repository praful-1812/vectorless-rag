"""LLM service: multi-provider via LiteLLM.

Supported providers (set the corresponding env var):
  - OpenAI:    OPENAI_API_KEY
  - Anthropic: ANTHROPIC_API_KEY
  - Google:    GEMINI_API_KEY
  - Ollama:    No key needed (local), use model like 'ollama/llama3'
  - Azure:     AZURE_API_KEY + AZURE_API_BASE
  - Any LiteLLM-supported provider

Change DEFAULT_MODEL below or pass model from the frontend.
"""

import json
import logging
import asyncio
from typing import AsyncGenerator
import litellm

logger = logging.getLogger(__name__)

MAX_RETRIES = 5
RETRY_BASE_DELAY = 4  # seconds

# Default model if user hasn't configured one
# Change this to use a different provider:
#   "openai/gpt-4o-mini"        → OpenAI (needs OPENAI_API_KEY)
#   "anthropic/claude-haiku-4-20250514"  → Anthropic (needs ANTHROPIC_API_KEY)
#   "gemini/gemini-2.0-flash"   → Google (needs GEMINI_API_KEY)
#   "ollama/llama3"             → Local Ollama (no key needed!)
DEFAULT_MODEL = "gemini/gemini-3.1-flash-lite"


async def summarize_text(text: str, instruction: str, model: str | None = None) -> str:
    """Use LLM to summarize text for tree building."""
    model = model or DEFAULT_MODEL
    logger.info(f"[LLM] Summarize request → model={model}, text_length={len(text)}")
    logger.debug(f"[LLM] Instruction: {instruction}")

    for attempt in range(MAX_RETRIES):
        try:
            response = await litellm.acompletion(
                model=model,
                messages=[
                    {"role": "system", "content": instruction},
                    {"role": "user", "content": text[:4000]},
                ],
                max_tokens=300,
                temperature=0.3,
            )
            result = response.choices[0].message.content
            logger.info(f"[LLM] ✓ Summary received ({len(result)} chars)")
            return result
        except litellm.RateLimitError as e:
            delay = RETRY_BASE_DELAY * (attempt + 1)
            logger.warning(f"[LLM] Rate limited (attempt {attempt+1}/{MAX_RETRIES}), retrying in {delay}s...")
            await asyncio.sleep(delay)
        except Exception as e:
            logger.error(f"[LLM] ✗ FAILED: {e}")
            logger.error(f"[LLM]   Model: {model}")
            import os
            for key in ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]:
                val = os.environ.get(key, "")
                logger.error(f"[LLM]     {key}={'set (' + val[:8] + '...)' if val else 'NOT SET'}")
            raise

    raise Exception(f"Rate limit exceeded after {MAX_RETRIES} retries")


async def llm_select_branches(
    query: str,
    branches: list[dict],
    model: str | None = None,
) -> list[int]:
    """LLM decides which tree branches are relevant to the query."""
    model = model or DEFAULT_MODEL
    logger.info(f"[LLM] Branch selection → model={model}, query='{query[:50]}...', branches={len(branches)}")

    branch_descriptions = "\n".join(
        f"[ID: {b['id']}] {b['location']}: {b['summary'][:200]}"
        for b in branches
    )

    try:
        response = await litellm.acompletion(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a retrieval assistant. Given a user query and a list of document sections, "
                        "return the IDs of sections most likely to contain the answer. "
                        "Return ONLY a JSON array of IDs, e.g. [1, 3, 5]. Select 1-3 most relevant."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Query: {query}\n\nSections:\n{branch_descriptions}",
                },
            ],
            max_tokens=100,
            temperature=0.1,
        )

        content = response.choices[0].message.content.strip()
        logger.info(f"[LLM] ✓ Branch selection response: {content}")

        ids = json.loads(content)
        if isinstance(ids, list):
            selected = [int(i) for i in ids if int(i) in [b["id"] for b in branches]]
            logger.info(f"[LLM] Selected branch IDs: {selected}")
            return selected
    except Exception as e:
        logger.error(f"[LLM] ✗ Branch selection failed: {e}")

    # Fallback: return first 3 branches
    fallback = [b["id"] for b in branches[:3]]
    logger.warning(f"[LLM] Using fallback branches: {fallback}")
    return fallback


async def generate_response(
    query: str,
    passages: list[dict],
    model: str | None,
    user=None,
    db=None,
) -> AsyncGenerator[str, None]:
    """Generate streaming response grounded in retrieved passages."""
    model = model or DEFAULT_MODEL
    logger.info(f"[LLM] Generate response → model={model}, passages={len(passages)}, query='{query[:50]}...'")

    # Build context from passages
    context = "\n\n---\n\n".join(
        f"[Source: {p['source_location']}]\n{p['content']}"
        for p in passages
    )
    logger.debug(f"[LLM] Context length: {len(context)} chars")

    messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful assistant. Answer the user's question based on the provided document passages. "
                "Cite your sources using [Source: ...] references. "
                "If the passages don't contain enough information, say so clearly."
            ),
        },
        {
            "role": "user",
            "content": f"## Retrieved Passages:\n\n{context}\n\n---\n\n## Question:\n{query}",
        },
    ]

    try:
        response = await litellm.acompletion(
            model=model,
            messages=messages,
            stream=True,
            temperature=0.7,
        )

        async for chunk in response:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content

        logger.info(f"[LLM] ✓ Response stream complete")
    except Exception as e:
        logger.error(f"[LLM] ✗ Generate response FAILED: {e}")
        yield f"\n\nError: {str(e)}\n\nMake sure your LLM API key is configured."
