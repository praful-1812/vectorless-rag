'use client';

import { useState, useEffect } from 'react';
import { createSession, listSessions, clearToken } from '@/lib/api';

interface SidebarProps {
  selectedSessionId: number | null;
  onSelectSession: (id: number | null) => void;
}

export function Sidebar({ selectedSessionId, onSelectSession }: SidebarProps) {
  const [sessions, setSessions] = useState<{ id: number; title: string }[]>([]);

  useEffect(() => {
    listSessions().then(setSessions).catch(() => {});
  }, []);

  const handleCreateSession = async () => {
    try {
      const session = await createSession();
      setSessions([session, ...sessions]);
      onSelectSession(session.id);
    } catch {}
  };

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <h1 className="text-lg font-bold">Vectorless RAG</h1>
        <button
          onClick={() => { clearToken(); window.location.reload(); }}
          className="text-xs text-gray-500 hover:text-red-400"
        >
          Logout
        </button>
      </div>

      <button
        onClick={handleCreateSession}
        className="m-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium"
      >
        + New Chat
      </button>

      <div className="flex-1 overflow-y-auto">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-800 ${
              selectedSessionId === session.id ? 'bg-gray-800' : ''
            }`}
          >
            {session.title}
          </button>
        ))}
      </div>
    </aside>
  );
}
