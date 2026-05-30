'use client';

import { useState } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { Sidebar } from '@/components/Sidebar';
import { ChatPanel } from '@/components/ChatPanel';
import { FilePanel } from '@/components/FilePanel';

export default function Home() {
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([]);
  const [showFiles, setShowFiles] = useState(true);

  return (
    <AuthGate>
      <div className="flex h-screen">
        <Sidebar
          selectedSessionId={selectedSessionId}
          onSelectSession={setSelectedSessionId}
        />

        <div className="flex flex-1">
          {showFiles && (
            <FilePanel
              selectedFileIds={selectedFileIds}
              onToggleFile={(id) =>
                setSelectedFileIds((prev) =>
                  prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
                )
              }
            />
          )}

          <ChatPanel
            sessionId={selectedSessionId}
            selectedFileIds={selectedFileIds}
            onToggleFiles={() => setShowFiles(!showFiles)}
            onSessionCreated={(id) => setSelectedSessionId(id)}
          />
        </div>
      </div>
    </AuthGate>
  );
}
