# Vectorless RAG

LLM Tree RAG — ask questions about your uploaded documents, grounded in source passages.

## Quick Start

### Backend (Python/FastAPI)

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add your API keys
python run.py
```

Backend runs at `http://localhost:8000`

### Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`

## Architecture

```
User uploads file
  → MarkItDown converts to Markdown
  → Chunks by sections
  → LLM builds summary tree (leaves → branches → root)

User asks question
  → LLM traverses tree (root → branches → leaves)
  → Relevant passages retrieved
  → LLM generates grounded answer with citations
```

## Tech Stack

- **Backend:** Python, FastAPI, SQLAlchemy, SQLite, MarkItDown, LiteLLM
- **Frontend:** Next.js, React, Tailwind CSS
- **LLM:** Multi-provider via LiteLLM (OpenAI, Anthropic, Google, Ollama)
- **Retrieval:** LLM Tree RAG (no vector embeddings)
