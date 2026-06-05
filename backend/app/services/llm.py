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
import os
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
DEFAULT_MODEL = "ollama/llama3"


# Map model prefix to env var name
MODEL_PREFIX_TO_ENV = {
    "gemini": "GEMINI_API_KEY",
    "google": "GEMINI_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "azure": "AZURE_API_KEY",
}

# Map provider_name (from DB) to env var name
PROVIDER_NAME_TO_ENV = {
    "google": "GEMINI_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
}


def set_api_key_for_model(model: str, api_key: str):
    """Set the correct environment variable for a given model's provider."""
    prefix = model.split("/")[0] if "/" in model else model
    env_var = MODEL_PREFIX_TO_ENV.get(prefix)
    if env_var:
        os.environ[env_var] = api_key
        logger.info(f"[LLM] Set {env_var} from user provider (for model {model})")


def get_env_var_for_provider(provider_name: str) -> str | None:
    """Get the env var name for a provider."""
    return PROVIDER_NAME_TO_ENV.get(provider_name)


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
        # For Ollama models, set larger context window
        extra_params = {}
        if model and model.startswith("ollama/"):
            extra_params["api_base"] = "http://localhost:11434"
            extra_params["num_ctx"] = 32768

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
            **extra_params,
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

    # Truncate passages to fit within context window
    # For Ollama with increased num_ctx (32K), allow more context
    # For cloud models, allow even more
    max_context_chars = 20000  # ~5K tokens for cloud models
    if model and model.startswith("ollama/"):
        max_context_chars = 24000  # ~6K tokens — fits well in 32K ctx with output room

    # Build context from passages, truncating each and total
    truncated_passages = []
    total_chars = 0
    max_per_passage = max_context_chars // max(len(passages), 1)
    for p in passages:
        content = p['content'][:max_per_passage]
        if total_chars + len(content) > max_context_chars:
            content = content[:max(0, max_context_chars - total_chars)]
            if content:
                file_label = f"{p.get('file_name', 'Unknown')} ({p.get('file_type', '')})"
                truncated_passages.append(f"[Source: {file_label} > {p['source_location']}]\n{content}")
            break
        file_label = f"{p.get('file_name', 'Unknown')} ({p.get('file_type', '')})"
        truncated_passages.append(f"[Source: {file_label} > {p['source_location']}]\n{content}")
        total_chars += len(content)

    context = "\n\n---\n\n".join(truncated_passages)
    logger.info(f"[LLM] Context length: {len(context)} chars (from {len(passages)} passages, truncated to {len(truncated_passages)})")

    # Collect unique file names for the prompt
    file_names = list(set(p.get('file_name', 'Unknown') for p in passages))

    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert document analyst. You are given passages extracted from the following source files:\n"
                f"{chr(10).join(f'  • {name}' for name in file_names)}\n\n"
                "INSTRUCTIONS:\n"
                "1. Analyze the content carefully, respecting the original format (tables, CSV data, structured data, etc.).\n"
                "2. Provide detailed, insightful answers based ONLY on the document content.\n"
                "3. Always cite sources using the format: **[Source: filename > section]**\n"
                "4. If data is tabular/CSV, summarize with key statistics, column descriptions, and notable patterns.\n"
                "5. Recognize the file type and format — mention it in your response (e.g., 'This is a CSV/Excel file containing...').\n"
                "6. Structure your response clearly with headings and bullet points when appropriate.\n"
                "7. If passages don't contain enough information for a complete answer, state what's missing."
            ),
        },
        {
            "role": "user",
            "content": f"## Source Documents:\n\n{context}\n\n---\n\n## Question:\n{query}",
        },
    ]

    # Calculate total prompt size for logging
    total_prompt_chars = sum(len(m["content"]) for m in messages)
    logger.info(f"[LLM] Total prompt size: {total_prompt_chars} chars (~{total_prompt_chars // 4} tokens)")

    try:
        # For Ollama models, set larger context window and ensure full output
        extra_params = {}
        if model and model.startswith("ollama/"):
            extra_params["api_base"] = "http://localhost:11434"
            extra_params["num_ctx"] = 32768
            extra_params["num_predict"] = 2048
            logger.info(f"[LLM] Ollama mode: num_ctx=32768, num_predict=2048")

        response = await litellm.acompletion(
            model=model,
            messages=messages,
            stream=True,
            temperature=0.7,
            max_tokens=2048,
            **extra_params,
        )

        total_chars = 0
        chunk_count = 0
        async for chunk in response:
            chunk_count += 1
            delta = chunk.choices[0].delta
            finish_reason = chunk.choices[0].finish_reason
            if delta.content:
                total_chars += len(delta.content)
                yield delta.content
            if finish_reason:
                logger.info(f"[LLM] Stream finish_reason: {finish_reason} (after {chunk_count} chunks)")

        logger.info(f"[LLM] ✓ Response stream complete ({total_chars} chars, {chunk_count} chunks total)")
    except Exception as e:
        logger.error(f"[LLM] ✗ Generate response FAILED: {e}")
        yield f"\n\nError: {str(e)}\n\nMake sure your LLM API key is configured."
