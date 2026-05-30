# Vectorless RAG

A **document Q&A system** using LLM Tree RAG — no vector embeddings needed. Upload documents, and ask questions grounded in source passages.

## How It Works

```
User uploads file
  → MarkItDown converts to Markdown (PDF, DOCX, XLSX, etc.)
  → Chunks by sections/headings
  → LLM builds hierarchical summary tree (leaves → branches → root)

User asks question
  → LLM traverses tree top-down (root → relevant branches → leaves)
  → Relevant passages retrieved
  → LLM generates grounded answer with citations
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11+, FastAPI, SQLAlchemy, SQLite |
| Frontend | Next.js 14, React, Tailwind CSS |
| File Parsing | MarkItDown (PDF, DOCX, XLSX, PPTX, HTML, etc.) |
| LLM | Multi-provider via LiteLLM (OpenAI, Anthropic, Google Gemini, Ollama) |
| Retrieval | LLM Tree RAG (no vector embeddings!) |
| Package Manager | `uv` (backend), `npm` (frontend) |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- [`uv`](https://docs.astral.sh/uv/) (Python package manager)

### 1. Backend

```bash
cd backend

# Install dependencies with uv
uv sync

# Copy env file and add your LLM API key
cp .env.example .env
# Edit .env → add GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY

# Start the server
uv run python -m uvicorn app.main:app --reload --port 8000
```

Backend runs at http://localhost:8000

### 2. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend runs at http://localhost:3000

### 3. Use It

1. Open http://localhost:3000
2. Register/login
3. Upload a document (PDF, DOCX, XLSX, etc.)
4. Wait for indexing to complete (progress bar)
5. Select the file and ask a question

## Project Structure

```
vectorless-rag/
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI route handlers
│   │   ├── db/           # SQLAlchemy models & database
│   │   ├── services/     # Core logic (ingestion, retrieval, LLM)
│   │   ├── config.py     # Settings
│   │   └── main.py       # App entrypoint
│   ├── pyproject.toml    # Python dependencies (uv)
│   └── .env.example      # Environment template
├── frontend/
│   ├── src/
│   │   ├── app/          # Next.js pages
│   │   ├── components/   # React components
│   │   └── lib/          # API client
│   └── package.json
├── PLANNING.md           # Architecture & design decisions
└── README.md
```

## LLM Providers

Set one of these in `backend/.env`:

| Provider | Env Var | Model Example |
|----------|---------|---------------|
| Google Gemini | `GEMINI_API_KEY` | `gemini/gemini-3.1-flash-lite` |
| OpenAI | `OPENAI_API_KEY` | `openai/gpt-4o-mini` |
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic/claude-haiku-4-20250514` |
| Ollama (local) | None needed | `ollama/llama3` |

## License

MIT
