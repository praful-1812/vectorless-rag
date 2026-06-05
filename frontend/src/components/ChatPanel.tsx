'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { ModelSelector } from '@/components/ModelSelector';
import { getMessages, sendMessage, createSession, parseMessageStream } from '@/lib/api';

interface ChatPanelProps {
  sessionId: number | null;
  selectedFileIds: number[];
  onToggleFiles: () => void;
  onSessionCreated?: (id: number) => void;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  retrieved_passages?: { content: string; source_location: string }[];
}

export function ChatPanel({ sessionId, selectedFileIds, onToggleFiles, onSessionCreated }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('ollama/llama3');
  const [isStreaming, setIsStreaming] = useState(false);
  const [progressStage, setProgressStage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load messages when session changes (but not while streaming)
  useEffect(() => {
    if (isStreaming) return;
    if (sessionId) {
      getMessages(sessionId).then(setMessages).catch(() => {});
    } else {
      setMessages([]);
    }
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    let activeSessionId = sessionId;

    // Auto-create session if none selected
    if (!activeSessionId) {
      try {
        const session = await createSession();
        activeSessionId = session.id;
        onSessionCreated?.(session.id);
      } catch {
        return;
      }
    }

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: input,
    };
    setMessages((prev) => [...prev, userMessage]);
    const query = input;
    setInput('');
    setIsStreaming(true);

    try {
      const stream = await sendMessage(activeSessionId!, query, selectedFileIds, selectedModel);
      if (!stream) return;

      const assistantMsg: ChatMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: '',
      };
      let contentStarted = false;

      for await (const event of parseMessageStream(stream)) {
        if (event.type === 'progress') {
          setProgressStage(event.message);
        } else if (event.type === 'content') {
          if (!contentStarted) {
            contentStarted = true;
            setProgressStage(null);
            setMessages((prev) => [...prev, assistantMsg]);
          }
          assistantMsg.content += event.text;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: assistantMsg.content } : m
            )
          );
        } else if (event.type === 'done') {
          setProgressStage(null);
        }
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: 'assistant', content: `Error: ${err.message}` },
      ]);
    } finally {
      setIsStreaming(false);
      setProgressStage(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <h2 className="text-2xl font-light text-gray-200">What are you working on?</h2>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => setInput('Summarize the key insights from my files')}
                className="px-4 py-2.5 text-sm text-gray-300 border border-gray-700 rounded-full hover:bg-gray-800 hover:border-gray-600 transition-colors flex items-center gap-2"
              >
                📊 Summarize insights
              </button>
              <button
                onClick={() => setInput('Compare the data across my files')}
                className="px-4 py-2.5 text-sm text-gray-300 border border-gray-700 rounded-full hover:bg-gray-800 hover:border-gray-600 transition-colors flex items-center gap-2"
              >
                🔍 Compare data
              </button>
              <button
                onClick={() => setInput('Suggest analytical questions from my files')}
                className="px-4 py-2.5 text-sm text-gray-300 border border-gray-700 rounded-full hover:bg-gray-800 hover:border-gray-600 transition-colors flex items-center gap-2"
              >
                💡 Suggest questions
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`max-w-3xl mx-auto p-4 rounded-lg ${
              msg.role === 'user'
                ? 'bg-blue-900/30 ml-auto'
                : 'bg-gray-800'
            }`}
          >
            {msg.role === 'user' ? (
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            ) : (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            )}

            {/* Source citations */}
            {msg.retrieved_passages && msg.retrieved_passages.length > 0 && (
              <div className="mt-3 border-t border-gray-700 pt-2">
                <p className="text-xs text-gray-400 mb-1">Sources:</p>
                {msg.retrieved_passages.map((p, i) => (
                  <button
                    key={i}
                    className="text-xs text-blue-400 hover:underline mr-2"
                  >
                    [{p.source_location}]
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {isStreaming && progressStage && (
          <div className="max-w-3xl mx-auto p-4 rounded-lg bg-gray-800 border border-gray-700">
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:300ms]" />
              </div>
              <p className="text-sm text-gray-300">{progressStage}</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-gray-800 p-4">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <button
            onClick={onToggleFiles}
            className="px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg"
            title="Toggle file panel" 
          >
            📁
          </button>

          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={sessionId ? "Ask a question about your files..." : "Create a new chat session first →"}
              className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>

          {/* Model selector dropdown (like Copilot chat bar) */}
          <ModelSelector
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
          />

          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || selectedFileIds.length === 0}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium"
          >
            Send
          </button>
        </div>

        {selectedFileIds.length === 0 && (
          <p className="text-xs text-yellow-500 mt-2 max-w-3xl mx-auto">
            Select at least one file to start chatting
          </p>
        )}
        {selectedFileIds.length > 0 && (
          <p className="text-xs text-gray-500 mt-2 max-w-3xl mx-auto">
            Searching in {selectedFileIds.length} file(s)
          </p>
        )}
      </div>
    </div>
  );
}
