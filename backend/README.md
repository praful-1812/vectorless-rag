# Backend — Vectorless RAG

FastAPI backend for LLM Tree RAG document Q&A.

## Setup

### Requirements

- Python 3.11+
- [`uv`](https://docs.astral.sh/uv/) — fast Python package manager

### Install & Run

```bash
# Install all dependencies (creates .venv automatically)
uv sync

# Copy environment config
cp .env.example .env

# Edit .env and add your LLM API key:
#   GEMINI_API_KEY=your-key-here
#   or OPENAI_API_KEY=your-key-here
#   or ANTHROPIC_API_KEY=your-key-here

# Start the development server (auto-reloads on changes)
uv run python -m uvicorn app.main:app --reload --port 8000
```

Server runs at http://localhost:8000  
API docs at http://localhost:8000/docs

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | No | SQLite connection string (default: `./vectorless_rag.db`) |
| `SECRET_KEY` | Yes | JWT signing key (generate with `python -c "import secrets; print(secrets.token_hex(32))"`) |
| `UPLOAD_DIR` | No | Where uploaded files are stored (default: `./uploads`) |
| `GEMINI_API_KEY` | One of these | Google Gemini API key |
| `OPENAI_API_KEY` | One of these | OpenAI API key |
| `ANTHROPIC_API_KEY` | One of these | Anthropic API key |

## Project Structure

```
app/
├── main.py              # FastAPI app, CORS, startup
├── config.py            # Pydantic settings (reads .env)
├── api/
│   ├── auth.py          # Register, login (JWT + bcrypt)
│   ├── files.py         # Upload, list, delete files
│   ├── chat.py          # Chat sessions, streaming messages
│   ├── settings.py      # User settings, LLM providers, memory
│   └── deps.py          # Auth dependency (get_current_user)
├── db/
│   ├── database.py      # SQLAlchemy async engine, session
│   └── models.py        # User, File, TreeNode, ChatSession, Message, etc.
└── services/
    ├── ingestion.py     # MarkItDown → chunk → build LLM tree
    ├── retrieval.py     # Tree traversal to find relevant passages
    └── llm.py           # LiteLLM wrapper (summarize, select, generate)
```

## Key Concepts

### LLM Tree RAG

1. **Ingestion**: File → Markdown → Chunks → LLM summarizes into a tree
   - Leaves = raw text chunks
   - Branches = LLM summaries of 4 leaves each
   - Root = LLM summary of all branches

2. **Retrieval**: Query → LLM picks relevant branches → return leaf passages

3. **Generation**: Passages + query → LLM generates grounded answer

### Adding Dependencies

```bash
uv add <package-name>        # Add a runtime dependency
uv add --dev <package-name>  # Add a dev dependency
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login (returns JWT) |
| POST | `/api/files/upload` | Upload file (triggers ingestion) |
| GET | `/api/files/` | List user's files |
| DELETE | `/api/files/{id}` | Delete file |
| POST | `/api/chat/sessions` | Create chat session |
| GET | `/api/chat/sessions` | List sessions |
| POST | `/api/chat/sessions/{id}/messages` | Send message (streaming) |
| GET | `/api/chat/sessions/{id}/messages` | Get message history |
