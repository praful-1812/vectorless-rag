'use client';

import { useState, useEffect } from 'react';
import {
  getSettings,
  updateSettings,
  listProviders,
  addProvider,
  deleteProvider,
  getMemory,
  deleteMemoryItem,
} from '@/lib/api';
import { useTheme } from '@/components/ThemeProvider';

interface SettingsPanelProps {
  onClose: () => void;
}

interface Provider {
  id: number;
  provider_name: string;
  models: string[];
  is_active: boolean;
  masked_key: string;
  api_key: string;
}

interface MemoryItem {
  id: number;
  key: string;
  value: string;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'providers' | 'memory'>('general');
  const { theme, setTheme } = useTheme();

  // General settings
  const [settings, setSettings] = useState({
    file_scoped_enabled: true,
    collections_enabled: false,
    knowledge_comparison_enabled: false,
    deduplication_notices_enabled: false,
  });

  // Providers
  const [providers, setProviders] = useState<Provider[]>([]);
  const [newProvider, setNewProvider] = useState({ name: '', key: '' });
  const [addingProvider, setAddingProvider] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());

  // Memory
  const [memory, setMemory] = useState<MemoryItem[]>([]);

  useEffect(() => {
    loadSettings();
    loadProviders();
    loadMemory();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await getSettings();
      setSettings(data);
    } catch {}
  };

  const loadProviders = async () => {
    try {
      const data = await listProviders();
      setProviders(data);
    } catch {}
  };

  const loadMemory = async () => {
    try {
      const data = await getMemory();
      setMemory(data);
    } catch {}
  };

  const handleToggle = async (key: string, value: boolean) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await updateSettings({ [key]: value });
  };

  const handleAddProvider = async () => {
    if (!newProvider.name || !newProvider.key) return;
    setAddingProvider(true);
    try {
      const provider = await addProvider(newProvider.name, newProvider.key);
      setProviders([...providers, provider]);
      setNewProvider({ name: '', key: '' });
      setShowAddForm(false);
    } catch (err: any) {
      alert('Failed to add provider: ' + err.message);
    } finally {
      setAddingProvider(false);
    }
  };

  const toggleKeyVisibility = (id: number) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteProvider = async (id: number) => {
    await deleteProvider(id);
    setProviders(providers.filter((p) => p.id !== id));
  };

  const handleDeleteMemory = async (id: number) => {
    await deleteMemoryItem(id);
    setMemory(memory.filter((m) => m.id !== id));
  };

  const tabs = [
    { id: 'general' as const, label: '⚙️ General' },
    { id: 'providers' as const, label: '🔑 LLM Providers' },
    { id: 'memory' as const, label: '🧠 Memory' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium ${
                activeTab === tab.id
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'general' && (
            <div className="space-y-4">
              {/* Theme selector */}
              <div className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
                <div className="flex-1 pr-4">
                  <p className="text-sm font-medium">Theme</p>
                  <p className="text-xs text-gray-400 mt-0.5">Switch between dark and light appearance.</p>
                </div>
                <div className="flex gap-1 bg-gray-700 rounded-lg p-1">
                  <button
                    onClick={() => setTheme('dark')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      theme === 'dark' ? 'bg-gray-900 text-white shadow' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    🌙 Dark
                  </button>
                  <button
                    onClick={() => setTheme('light')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      theme === 'light' ? 'bg-white text-gray-900 shadow' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    ☀️ Light
                  </button>
                </div>
              </div>

              <ToggleItem
                label="File-scoped questions"
                description="When enabled, searches only selected files. When disabled, searches all your files."
                checked={settings.file_scoped_enabled}
                onChange={(v) => handleToggle('file_scoped_enabled', v)}
              />
              <ToggleItem
                label="Collections"
                description="Group files into collections for organized retrieval."
                checked={settings.collections_enabled}
                onChange={(v) => handleToggle('collections_enabled', v)}
              />
              <ToggleItem
                label="Knowledge comparison"
                description="Cross-check document answers against LLM general knowledge to flag potential issues."
                checked={settings.knowledge_comparison_enabled}
                onChange={(v) => handleToggle('knowledge_comparison_enabled', v)}
              />
              <ToggleItem
                label="Deduplication notices"
                description="Notify when duplicate information appears across multiple files."
                checked={settings.deduplication_notices_enabled}
                onChange={(v) => handleToggle('deduplication_notices_enabled', v)}
              />
            </div>
          )}

          {activeTab === 'providers' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Manage your LLM provider API keys. These are stored per-user and used for retrieval and chat.
              </p>

              {/* Provider list */}
              {providers.length > 0 && (
                <div className="space-y-2">
                  {providers.map((p) => (
                    <div
                      key={p.id}
                      className="bg-gray-800 rounded-lg px-4 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium capitalize">{p.provider_name}</span>
                          {p.is_active && (
                            <span className="text-xs text-green-500">● Active</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteProvider(p.id)}
                          className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <code className="text-xs text-gray-400 bg-gray-900 px-2 py-1 rounded font-mono flex-1">
                          {visibleKeys.has(p.id) ? p.api_key : '••••••••••••••••'}
                        </code>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleKeyVisibility(p.id); }}
                          className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                          title={visibleKeys.has(p.id) ? 'Hide key' : 'Show key'}
                        >
                          {visibleKeys.has(p.id) ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add provider - show form or button */}
              {providers.length === 0 || showAddForm ? (
                <div className="border border-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Add Provider</h4>
                    {providers.length > 0 && (
                      <button
                        onClick={() => setShowAddForm(false)}
                        className="text-xs text-gray-500 hover:text-gray-300"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  <select
                    value={newProvider.name}
                    onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Select provider...</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google (Gemini)</option>
                    <option value="ollama">Ollama (Local)</option>
                  </select>
                  <input
                    type="password"
                    value={newProvider.key}
                    onChange={(e) => setNewProvider({ ...newProvider, key: e.target.value })}
                    placeholder="API Key (sk-... or AIza...)"
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={handleAddProvider}
                    disabled={!newProvider.name || !newProvider.key || addingProvider}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium"
                  >
                    {addingProvider ? 'Adding...' : 'Add Provider'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full px-4 py-2 border border-dashed border-gray-600 hover:border-blue-500 rounded-lg text-sm text-gray-400 hover:text-blue-400 transition-colors"
                >
                  + Add Provider
                </button>
              )}
            </div>
          )}

          {activeTab === 'memory' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Persistent knowledge the system remembers across chat sessions. You can delete items you no longer want remembered.
              </p>

              {memory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-2xl mb-2">🧠</p>
                  <p className="text-sm">No remembered context yet.</p>
                  <p className="text-xs mt-1">The system will learn things as you chat.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {memory.map((item) => (
                    <div
                      key={item.id}
                      className="bg-gray-800 rounded-lg px-4 py-3 group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <span className="text-xs text-blue-400 font-medium">{item.key}</span>
                          <p className="text-sm text-gray-300 mt-1">{item.value}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteMemory(item.id)}
                          className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity ml-3 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Toggle switch component
function ToggleItem({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
      <div className="flex-1 pr-4">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-600'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
