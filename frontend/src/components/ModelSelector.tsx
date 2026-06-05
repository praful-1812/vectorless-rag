'use client';

import { useState } from 'react';

interface ModelSelectorProps {
  selectedModel: string;
  onSelectModel: (model: string) => void;
}

const AVAILABLE_MODELS = [
  { id: 'ollama/llama3', label: 'Llama 3', provider: 'Ollama (Local)' },
  { id: 'ollama/llama3.1', label: 'Llama 3.1', provider: 'Ollama (Local)' },
  { id: 'ollama/mistral', label: 'Mistral', provider: 'Ollama (Local)' },
  { id: 'ollama/gemma2', label: 'Gemma 2', provider: 'Ollama (Local)' },
  { id: 'gemini/gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', provider: 'Google' },
  { id: 'gemini/gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'Google' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI' },
  { id: 'openai/gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
  { id: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet', provider: 'Anthropic' },
  { id: 'anthropic/claude-haiku-4-20250514', label: 'Claude Haiku', provider: 'Anthropic' },
];

export function ModelSelector({ selectedModel, onSelectModel }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);

  const currentModel = AVAILABLE_MODELS.find((m) => m.id === selectedModel);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 whitespace-nowrap"
      >
        {currentModel?.label || 'Select Model'} ▾
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
          <div className="p-2">
            <p className="text-xs text-gray-400 px-2 py-1 font-semibold">Select Model</p>
            {AVAILABLE_MODELS.map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  onSelectModel(model.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-700 ${
                  selectedModel === model.id ? 'bg-gray-700' : ''
                }`}
              >
                <span>{model.label}</span>
                <span className="text-xs text-gray-500 ml-2">{model.provider}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
