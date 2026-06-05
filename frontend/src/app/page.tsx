'use client';

import { useState, useEffect, useCallback } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { Sidebar } from '@/components/Sidebar';
import { ChatPanel } from '@/components/ChatPanel';
import { FilePanel } from '@/components/FilePanel';
import { SettingsPanel } from '@/components/SettingsPanel';
import { ResizeHandle } from '@/components/ResizeHandle';
import { listFiles } from '@/lib/api';

export default function Home() {
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([]);
  const [showFiles, setShowFiles] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(256); // 16rem = 256px
  const [filePanelWidth, setFilePanelWidth] = useState(288); // 18rem = 288px

  useEffect(() => {
    const poll = () => listFiles().then((f) => setFileCount(f.length)).catch(() => {});
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => Math.min(Math.max(w + delta, 180), 400));
  }, []);

  const handleFilePanelResize = useCallback((delta: number) => {
    setFilePanelWidth((w) => Math.min(Math.max(w + delta, 200), 500));
  }, []);

  return (
    <AuthGate>
      <div className="flex h-screen overflow-hidden">
        {/* Collapsible sidebar on the left */}
        <div
          className="h-full overflow-hidden flex-shrink-0"
          style={{ width: showSidebar ? `${sidebarWidth}px` : '48px', transition: showSidebar ? 'none' : 'width 0.3s' }}
        >
          {showSidebar ? (
            <Sidebar
              selectedSessionId={selectedSessionId}
              onSelectSession={setSelectedSessionId}
              onOpenSettings={() => setShowSettings(true)}
              onCollapse={() => setShowSidebar(false)}
            />
          ) : (
            <div
              className="w-12 h-full bg-gray-900 border-r border-gray-800 flex flex-col items-center pt-4 cursor-pointer hover:bg-gray-800/50 transition-colors"
              onClick={() => setShowSidebar(true)}
              title="Expand sidebar"
            >
              <button
                className="group p-1.5 rounded-lg hover:bg-gray-800 transition-all duration-200"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4 text-gray-500 group-hover:text-blue-400 transition-colors duration-200"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Resize handle for sidebar */}
        {showSidebar && <ResizeHandle side="left" onResize={handleSidebarResize} />}

        <ChatPanel
          sessionId={selectedSessionId}
          selectedFileIds={selectedFileIds}
          onToggleFiles={() => setShowFiles(!showFiles)}
          onSessionCreated={(id) => setSelectedSessionId(id)}
        />

        {/* Resize handle for file panel */}
        {showFiles && <ResizeHandle side="right" onResize={handleFilePanelResize} />}

        {/* Collapsible file panel on the right */}
        <div
          className="h-full overflow-hidden flex-shrink-0"
          style={{ width: showFiles ? `${filePanelWidth}px` : '64px', transition: showFiles ? 'none' : 'width 0.3s' }}
        >
          {showFiles ? (
            <FilePanel
              selectedFileIds={selectedFileIds}
              onToggleFile={(id) =>
                setSelectedFileIds((prev) =>
                  prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
                )
              }
              onSelectAll={(ids) => setSelectedFileIds(ids)}
              onClose={() => setShowFiles(false)}
            />
          ) : (
            <div
              className="w-16 h-full bg-gray-900 border-l border-gray-800 flex flex-col items-center cursor-pointer hover:bg-gray-800/50 transition-colors"
              title="Expand sources panel"
              onClick={() => setShowFiles(true)}
            >
              {/* Expand button at top */}
              <div className="pt-4">
                <button
                  onClick={() => setShowFiles(true)}
                  className="group p-1.5 rounded-lg hover:bg-gray-800 transition-all duration-200"
                  title="Expand panel"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4 text-gray-500 group-hover:text-blue-400 transition-colors duration-200"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
                  </svg>
                </button>
              </div>
              {/* File icon + count centered */}
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center justify-center gap-1 p-3 rounded-xl bg-gray-800">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-7 h-7 text-blue-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  {fileCount > 0 && (
                    <span className="text-sm font-bold text-blue-400">
                      {fileCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      </div>
    </AuthGate>
  );
}
