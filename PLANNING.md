# Vectorless RAG — Project Planning

> A web-based RAG system where users upload files, ask questions, and get grounded answers — using LLM Tree RAG instead of vector embeddings.

---

## ❓ What "Vectorless" Means — LLM Tree RAG

| | Traditional Vector RAG | LLM Tree RAG (This Project) |
|---|---|---|
| **Storage** | Chunks as embedding vectors in vector DB (FAISS, Pinecone) | LLM-generated hierarchical summary tree + chunks in DB |
| **Index building** | Embed every chunk (embedding model) | LLM summarizes chunks → builds tree of summaries |
| **Retrieval** | Cosine similarity on embeddings | LLM traverses tree: root → branch → leaf → relevant chunks |
| **Embedding model needed?** | ✅ Yes (expensive, model-dependent) | ❌ No |
| **Query understanding** | Semantic similarity (can miss intent) | LLM reasons about which branch is relevant (better intent understanding) |
| **Strengths** | Fast ANN search, scales well | Better reasoning, handles complex queries, no embedding drift |
| **Tradeoffs** | Misses nuance, embedding quality matters | More LLM calls during indexing, slower retrieval than ANN |

### How LLM Tree RAG Works

```
INDEXING (one-time per document):

Document → MarkItDown → Markdown → Chunk by sections
                                        │
                                        ▼
                              ┌─────────────────────┐
                              │  Leaf chunks (raw)   │
                              └─────────┬───────────┘
                                        │ LLM summarizes groups
                                        ▼
                              ┌─────────────────────┐
                              │  Branch summaries    │
                              └─────────┬───────────┘
                                        │ LLM summarizes branches
                                        ▼
                              ┌─────────────────────┐
                              │  Root summary        │
                              └─────────────────────┘

RETRIEVAL (per query):

User Question
      │
      ▼
┌──────────────┐     "Which branch is relevant?"
│ Root summary │ ──→ LLM decides
└──────┬───────┘
       │
       ▼
┌──────────────────┐     "Which sub-branch?"
│ Branch summaries │ ──→ LLM decides
└──────┬───────────┘
       │
       ▼
┌──────────────┐
│ Leaf chunks  │ ──→ Retrieved passages sent to final LLM call
└──────────────┘
       │
       ▼
  Final Answer (grounded in passages)
```

**Why Tree RAG over vectors:**
1. No embedding model dependency — works with any LLM
2. Better complex query handling — LLM reasons about relevance, not just similarity
3. Hierarchical understanding — knows document structure, not just flat chunks
4. Self-improving — swap to better LLM = better retrieval (no re-embedding needed)
5. Still vectorless — no vector DB, no cosine similarity, no embedding drift

---

## 🎯 Core Concept

A web application where:
- Users upload any type of file (PDF, DOCX, images, spreadsheets, etc.)
- Files persist across sessions per user
- Users can create new chat sessions
- Users can select/enable specific files per question
- Retrieval uses TF-IDF, BM25, structural parsing — **no vector embeddings**

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Web UI)                        │
│  File Manager │ Chat Interface │ Source Preview │ Settings       │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND API                              │
│  Auth │ File Ingestion │ Retrieval │ Chat │ Session Management  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │  File    │ │  Index   │ │   LLM    │
              │  Storage │ │  Store   │ │  Provider│
              └──────────┘ └──────────┘ └──────────┘
```

---

## 📋 Feature Stages

### Stage 1: Core MVP

#### 1.1 File Management
| Feature | Description | Priority |
|---------|-------------|----------|
| File upload (drag-and-drop) | Support PDF, DOCX, TXT, CSV, XLSX, PPTX, images, audio | P0 |
| File parsing via MarkItDown | Convert all uploads to Markdown for indexing | P0 |
| File persistence | Files stored per user, always available | P0 |
| File selection per question | User enables/disables files for each query (toggle in settings) | P0 |
| Progress indicators | Show ingestion progress for large files | P0 |
| File preview | View uploaded file contents in-app | P1 |

#### 1.2 Chat & Sessions
| Feature | Description | Priority |
|---------|-------------|----------|
| New chat sessions | User creates fresh conversations | P0 |
| Session history | Browse past sessions | P0 |
| File-scoped questions | Answers grounded in selected files only (toggleable) | P0 |
| LLM selector dropdown | Chat bar corner dropdown to pick model (like Copilot) | P0 |
| LLM API key management | Add/remove providers + keys in settings | P0 |
| Follow-up suggestions | System suggests next questions | P1 |
| Export/share answers | Copy or share chat with citations | P2 |

#### 1.3 Retrieval (LLM Tree RAG)
| Feature | Description | Priority |
|---------|-------------|----------|
| Tree index building | LLM summarizes chunks → branches → root per document | P0 |
| Tree traversal retrieval | LLM navigates tree to find relevant leaf chunks | P0 |
| BM25 fallback | Fast keyword search as fallback / pre-filter | P1 |
| Metadata filtering | Filter by file type, date, name before tree traversal | P1 |
| Query decomposition | Break complex questions into sub-queries, traverse tree for each | P1 |
| Cross-document tree | Merge trees from multiple files for cross-doc reasoning | P2 |
| Re-ranking | After tree retrieval, re-rank passages for final prompt | P2 |
| Incremental tree update | Update tree when file is modified (not full rebuild) | P2 |

#### 1.4 UX Features
| Feature | Description | Priority |
|---------|-------------|----------|
| Source preview panel | Click citation → see original passage | P0 |
| "Show me where" | Highlight exact passage in source document | P0 |
| Feedback loop (thumbs up/down) | User feedback improves future retrieval | P1 |
| Drag-and-drop upload | Easy file ingestion | P0 |

---

### Stage 1.5: Knowledge & Intelligence

#### Persistent Knowledge Base
- Store cross-session information about the user
- **UI Feature:** Show user what the system remembers about them
- User can view, edit, or delete remembered context
- Transparency: "Here's what I know about you from past sessions"

#### User-Defined Collections
- Group files into collections (e.g., "Legal docs", "Research papers")
- **Smart behavior:**
  - When user asks a question from their documents, answer from documents
  - If LLM has general knowledge that differs, surface it as a secondary note
  - System compares document info vs LLM knowledge and flags discrepancies
  - Alert: "⚠️ Your document states X, but general knowledge suggests Y"
  - **User control:** This comparison feature is toggleable (user can disable it)

#### Deduplication Awareness
- Don't silently deduplicate — **inform the user**
- When answering from duplicate content: "This information appears in: File A (page 3), File B (page 12), File C (section 2.1)"
- Let user know the overlap exists across their documents

#### Cross-Document Reasoning
- "Compare these 3 contracts"
- Side-by-side differences
- Synthesize information across multiple files

---

### Stage 2: Trust & Reliability

| Feature | Description | Implementation Approach |
|---------|-------------|------------------------|
| Hallucination detection | Flag when answer isn't grounded in selected files | Compare generated claims against retrieved passages |
| Citation verification | Prove answer matches source | Link every claim to a specific passage with highlight |
| Contradiction detection | Flag when sources disagree | Cross-validate retrieved passages before generating |
| "I don't know" responses | Refuse to answer when context is insufficient | Confidence threshold — if retrieval score too low, say so |
| Audit trail | Full log of who asked what, what was retrieved, what was generated | Per-user query log with retrieval details |

---

## ⚙️ User Settings (UI → Backend)

Settings configured by the user in the frontend that control backend behavior:

| Setting | UI Element | Backend Effect |
|---------|-----------|----------------|
| **File-scoped questions** | On/Off toggle | When ON: retrieval searches only selected files. When OFF: searches all user files |
| **User-defined collections** | On/Off toggle + collection manager | When ON: user can group files, select collections per query. When OFF: flat file list |
| **Show persistent knowledge base** | Viewable panel | Displays what the system remembers cross-session; user can edit/delete entries |
| **LLM Selection** | Dropdown in chat bar corner (like Copilot) | Routes requests to selected provider; user adds API key per provider |
| **Document vs LLM knowledge comparison** | On/Off toggle | When ON: system cross-checks document answers against LLM general knowledge |
| **Deduplication notices** | On/Off toggle | When ON: inform user where duplicate info appears |

### LLM Provider Management
- User adds LLM providers in settings (OpenAI, Anthropic, Google, Ollama, etc.)
- Each provider requires an API key (stored encrypted)
- **Chat bar UI:** Dropdown in the corner of the chat input (same UX as Copilot Chat) showing available models
- User can switch models mid-conversation
- Backend validates API key on save, shows available models per provider

---

## 🛠️ Tech Stack (Proposed)

### Frontend
- **Framework:** Next.js / React
- **UI:** Tailwind CSS + Shadcn/UI
- **File viewer:** PDF.js, mammoth (DOCX), SheetJS (Excel)
- **Chat bar:** Model selector dropdown (corner position, like VS Code Copilot)
- **State:** Zustand or React Context

### Backend
- **Runtime:** Python (FastAPI)
- **File processing:** [Microsoft MarkItDown](https://github.com/microsoft/markitdown) — converts PDF, DOCX, XLSX, PPTX, images, audio, HTML, and more into Markdown for LLM consumption
- **Search index:** SQLite FTS5 / Tantivy (all vectorless)
- **Storage:** S3-compatible (files) + PostgreSQL/SQLite (metadata, sessions, chunks)
- **LLM:** Multi-provider — OpenAI / Anthropic / Google / Ollama (user configures)

### File Parsing: MarkItDown
[`microsoft/markitdown`](https://github.com/microsoft/markitdown/tree/main) handles all file-to-text conversion:

| File Type | MarkItDown Support |
|-----------|-------------------|
| PDF | ✅ Text + OCR |
| Word (DOCX) | ✅ |
| Excel (XLSX) | ✅ Tables → Markdown |
| PowerPoint (PPTX) | ✅ Slides → Markdown |
| Images (JPG/PNG) | ✅ OCR + EXIF + LLM description |
| Audio (MP3/WAV) | ✅ Transcription via speech-to-text |
| HTML | ✅ |
| CSV / JSON / XML | ✅ |
| ZIP archives | ✅ Iterates contents |

**Why MarkItDown:**
- Single library handles all file types → simpler pipeline
- Outputs clean Markdown → easy to chunk by headings/sections
- Maintained by Microsoft, actively developed
- Python-native, fits FastAPI backend

### Retrieval Stack (LLM Tree RAG)
- **Tree building:** LLM summarizes leaf chunks → branch nodes → root (stored in DB as tree structure)
- **Tree traversal:** LLM evaluates query against each level, narrows down to relevant leaves
- **BM25 fallback:** SQLite FTS5 for fast pre-filtering when tree traversal is too slow
- **Structural parsing:** MarkItDown output (headings, sections) → natural chunk boundaries → leaf nodes
- **Chunking:** Semantic chunking by Markdown headings/paragraphs → tree leaves

---

## 📐 Data Model

```
User
├── id, email, preferences, settings (LLM providers, toggles)
├── remembered_context (cross-session knowledge)
│
├── LLM_Providers[]
│   ├── id, name (OpenAI, Anthropic, etc.)
│   ├── api_key (encrypted)
│   └── available_models[]
│
├── Files[]
│   ├── id, name, type, size, uploaded_at
│   ├── raw_storage_path
│   ├── markdown_content (MarkItDown output)
│   ├── tree_root_node_id
│   ├── tree_nodes[]
│   │   ├── id, parent_id, level (root/branch/leaf)
│   │   ├── summary (LLM-generated for branch/root)
│   │   ├── content (raw text for leaf nodes)
│   │   └── source_location (page, section, line range)
│   └── metadata (extracted dates, authors, etc.)
│
├── Collections[]
│   ├── id, name
│   └── file_ids[]
│
└── Sessions[]
    ├── id, title, created_at, selected_model
    └── Messages[]
        ├── role (user/assistant)
        ├── content
        ├── selected_file_ids[]
        ├── traversal_path[] (tree nodes visited during retrieval)
        ├── retrieved_passages[] (leaf nodes with source locations)
        └── feedback (thumbs_up/down, optional)
```

---

## 🔄 Query Flow

```
1. User selects files → asks question
                │
2. Query decomposition (if complex)
                │
3. Tree traversal: LLM reads root summaries of selected files
   → decides which branches are relevant
   → drills into branches → reaches leaf chunks
                │
4. Passage extraction with exact locations from leaf nodes
                │
5. Prompt assembly (passages + question + token budget)
                │
6. LLM generates answer with inline citations
                │
7. [Stage 2] Grounding check — verify claims vs passages
                │
8. [If enabled] Compare with LLM general knowledge
   → Flag discrepancies if user has this enabled
                │
9. Return answer + citations + source highlights
   + deduplication notices if applicable
```

---

## 🗓️ Milestones

### M1: Foundation (Weeks 1-3)
- [ ] Project setup (Next.js frontend + FastAPI backend)
- [ ] User auth (basic)
- [ ] File upload + storage
- [ ] MarkItDown integration (file → Markdown conversion)
- [ ] Chunking by Markdown structure (headings/sections → leaf nodes)
- [ ] LLM tree building (summarize leaves → branches → root)
- [ ] Tree storage in DB (nodes, parent-child relationships)
- [ ] Basic chat with file selection + tree traversal retrieval
- [ ] LLM provider settings + API key management
- [ ] Model selector dropdown in chat bar

### M2: Core Experience (Weeks 4-6)
- [ ] Source preview panel with passage highlighting
- [ ] Session management (create, browse, continue)
- [ ] Metadata filtering (file type, date)
- [ ] Follow-up suggestions
- [ ] Drag-and-drop upload UX polish

### M3: Intelligence Layer (Weeks 7-9)
- [ ] Persistent cross-session memory + transparency UI
- [ ] Collections (user-defined file groups)
- [ ] Deduplication awareness (inform, don't hide)
- [ ] Document vs LLM knowledge comparison (toggleable)
- [ ] Query decomposition for complex questions
- [ ] Cross-document reasoning ("compare these files")

### M4: Trust & Reliability — Stage 2 (Weeks 10-12)
- [ ] Hallucination detection
- [ ] Citation verification
- [ ] Contradiction detection across sources
- [ ] "I don't know" threshold
- [ ] Audit trail (per-user query history with full retrieval details)
- [ ] Feedback loop (thumbs up/down → adjust retrieval weights)

### M5: Polish & Scale (Weeks 13+)
- [ ] Additional file types (if MarkItDown doesn't cover)
- [ ] Export/share conversations
- [ ] Cross-document merged trees
- [ ] Incremental tree updates (edit file → update tree, not rebuild)
- [ ] BM25 hybrid (tree traversal + keyword pre-filter for speed)
- [ ] Performance optimization (cache tree traversal paths)
- [ ] Model switching mid-conversation

---

## 🔑 Design Principles

1. **Transparency over magic** — Always show the user what's happening (what's remembered, where info comes from, if sources conflict)
2. **User control** — Every smart feature is toggleable (knowledge comparison, deduplication notices, cross-session memory)
3. **Vectorless by design** — Prove that BM25/TF-IDF + large context windows + smart chunking is sufficient
4. **Grounded answers** — Every claim links to a source passage; if we can't ground it, we say so
5. **Files are first-class** — Not just context, but persistent assets the user manages
6. **Tree-first retrieval** — LLM reasons about relevance at each level, not just keyword matching

---

## 📝 Open Questions

- [ ] Self-hosted vs cloud deployment?
- [ ] Max file size / storage limits per user?
- [ ] Free tier vs paid?
- [ ] Real-time collaboration (multiple users, shared collections)?
- [ ] Offline mode?
- [ ] Which LLM providers to support at launch? (OpenAI, Anthropic, Google, Ollama?)
- [ ] Should model switching mid-conversation restart context or carry forward?
