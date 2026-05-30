# Frontend — Vectorless RAG

Next.js 14 frontend for the Vectorless RAG document Q&A system.

## Setup

### Requirements

- Node.js 18+
- npm

### Install & Run

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

App runs at http://localhost:3000

## Environment

The frontend calls the backend directly at `http://localhost:8000/api`. No environment variables needed for local dev.

## Project Structure

```
src/
├── app/
│   ├── layout.tsx        # Root layout (HTML, fonts)
│   ├── page.tsx          # Main page (assembles all panels)
│   └── globals.css       # Tailwind + custom animations
├── components/
│   ├── AuthGate.tsx      # Login/register form
│   ├── Sidebar.tsx       # Chat sessions list, new chat, logout
│   ├── FilePanel.tsx     # File upload, list, progress, delete
│   ├── ChatPanel.tsx     # Messages, streaming, markdown rendering
│   └── ModelSelector.tsx # LLM model dropdown
└── lib/
    └── api.ts            # API client (auth, files, chat, settings)
```

## Features

- **Auth**: JWT-based login/register
- **File Upload**: Drag-and-drop with progress bar, indexing status
- **Chat**: Streaming responses, auto-session creation
- **Markdown Rendering**: LLM responses rendered with proper formatting (bold, lists, code, etc.)
- **Model Selector**: Switch between LLM providers in the chat bar
- **Dark Theme**: Full dark mode UI

## Tech Stack

- [Next.js 14](https://nextjs.org/) — React framework
- [Tailwind CSS](https://tailwindcss.com/) — Styling
- [@tailwindcss/typography](https://tailwindcss.com/docs/typography-plugin) — Prose rendering for markdown
- [react-markdown](https://github.com/remarkjs/react-markdown) — Markdown to React components
