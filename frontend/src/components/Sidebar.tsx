'use client';

import { useState, useEffect, useRef } from 'react';
import { createSession, listSessions, clearToken, getMe, deleteSession, updateProfile, uploadAvatar } from '@/lib/api';

interface SidebarProps {
  selectedSessionId: number | null;
  onSelectSession: (id: number | null) => void;
  onOpenSettings: () => void;
  onCollapse?: () => void;
}

export function Sidebar({ selectedSessionId, onSelectSession, onOpenSettings, onCollapse }: SidebarProps) {
  const [sessions, setSessions] = useState<{ id: number; title: string }[]>([]);
  const [user, setUser] = useState<{ id: number; email: string; display_name?: string; avatar_url?: string } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listSessions().then(setSessions).catch(() => {});
    getMe().then(setUser).catch(() => {});
  }, []);

  const handleCreateSession = async () => {
    try {
      const session = await createSession();
      setSessions([session, ...sessions]);
      onSelectSession(session.id);
    } catch {}
  };

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    setSavingName(true);
    try {
      const updated = await updateProfile({ display_name: nameInput.trim() });
      setUser(updated);
      setEditingName(false);
    } catch {}
    setSavingName(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const updated = await uploadAvatar(file);
      setUser(updated);
    } catch (err: any) {
      alert('Avatar upload failed: ' + (err.message || 'Unknown error'));
    }
    setUploadingAvatar(false);
    e.target.value = '';
  };

  return (
    <aside className="w-full h-full bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="group p-1.5 rounded-lg hover:bg-gray-800 transition-all duration-200"
              title="Collapse sidebar"
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
          )}
          <h1 className="text-lg font-bold">Vectorless RAG</h1>
        </div>
      </div>

      <button
        onClick={handleCreateSession}
        className="m-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium"
      >
        + New Chat
      </button>

      <div className="flex-1 overflow-y-auto">
        {sessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isSelected={selectedSessionId === session.id}
            onSelect={() => onSelectSession(session.id)}
            onDelete={async () => {
              await deleteSession(session.id);
              setSessions(sessions.filter((s) => s.id !== session.id));
              if (selectedSessionId === session.id) onSelectSession(null);
            }}
          />
        ))}
      </div>

      {/* User section at bottom */}
      <div className="p-3 border-t border-gray-800 relative">
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className="w-full px-3 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg flex items-center gap-3 transition-colors"
        >
          {user?.avatar_url ? (
            <img
              src={`http://localhost:8000${user.avatar_url}?t=${Date.now()}`}
              alt="Avatar"
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {(user?.display_name || user?.email)?.charAt(0).toUpperCase() || '?'}
            </div>
          )}
          <span className="truncate text-left flex-1">{user?.display_name || user?.email?.split('@')[0] || 'User'}</span>
        </button>

        {/* User dropdown menu */}
        {showUserMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => { setShowUserMenu(false); setShowProfile(false); setEditingName(false); }} />
            <div className="absolute bottom-full left-3 right-3 mb-1 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
              {showProfile ? (
                <div className="p-5 space-y-4">
                  <p className="text-base font-semibold">Edit profile</p>
                  {/* Avatar with upload */}
                  <div className="flex flex-col items-center">
                    <div
                      className="relative group cursor-pointer"
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      {user?.avatar_url ? (
                        <img
                          src={`http://localhost:8000${user.avatar_url}?t=${Date.now()}`}
                          alt="Avatar"
                          className="w-20 h-20 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-gray-600 flex items-center justify-center text-2xl font-bold text-white">
                          {(user?.display_name || user?.email)?.substring(0, 2).toUpperCase() || '??'}
                        </div>
                      )}
                      {/* Hover overlay */}
                      <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        {uploadingAvatar ? (
                          <svg className="w-5 h-5 text-white animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Click to upload photo</p>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </div>
                  {/* Display name */}
                  <div className="border border-gray-600 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-gray-400">Display name</p>
                    {editingName ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="text"
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                          className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                          autoFocus
                          maxLength={50}
                          placeholder="Enter display name"
                        />
                        <button
                          onClick={handleSaveName}
                          disabled={savingName || !nameInput.trim()}
                          className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-white"
                        >
                          {savingName ? '...' : 'Save'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-sm font-medium">{user?.display_name || user?.email?.split('@')[0]}</p>
                        <button
                          onClick={() => { setNameInput(user?.display_name || user?.email?.split('@')[0] || ''); setEditingName(true); }}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Email */}
                  <div className="border border-gray-600 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-gray-400">Email</p>
                    <p className="text-sm font-medium">{user?.email}</p>
                  </div>
                  <button
                    onClick={() => { setShowProfile(false); setEditingName(false); }}
                    className="w-full px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded text-left"
                  >
                    ← Back
                  </button>
                </div>
              ) : (
                <div className="py-1">
                  <button
                    onClick={() => setShowProfile(true)}
                    className="w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 text-left flex items-center gap-2"
                  >
                    👤 Profile
                  </button>
                  <button
                    onClick={() => { onOpenSettings(); setShowUserMenu(false); }}
                    className="w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700 text-left flex items-center gap-2"
                  >
                    ⚙️ Settings
                  </button>
                  <button
                    onClick={() => { clearToken(); window.location.reload(); }}
                    className="w-full px-4 py-2.5 text-sm text-red-400 hover:bg-gray-700 text-left flex items-center gap-2"
                  >
                    🚪 Logout
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

// Session item with options menu
function SessionItem({ session, isSelected, onSelect, onDelete }: {
  session: { id: number; title: string };
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="relative group">
      <button
        onClick={onSelect}
        className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-800 flex items-center justify-between ${
          isSelected ? 'bg-gray-800' : ''
        }`}
      >
        <span className="truncate flex-1">{session.title}</span>
        <div
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </div>
      </button>
      {showMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
          <div className="absolute right-2 top-10 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[120px]">
            <button
              onClick={() => { onDelete(); setShowMenu(false); }}
              className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-gray-700 rounded"
            >
              🗑 Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
