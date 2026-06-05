'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { getFileContent } from '@/lib/api';

interface FileContentViewerProps {
  fileId: number;
  fileName: string;
  onClose: () => void;
}

export function FileContentViewer({ fileId, fileName, onClose }: FileContentViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{ file_type: string; size: number; tree_built: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getFileContent(fileId)
      .then((data) => {
        setContent(data.markdown_content);
        setFileInfo({ file_type: data.file_type, size: data.size, tree_built: data.tree_built });
      })
      .catch((err) => setError(err.message || 'Failed to load file content'))
      .finally(() => setLoading(false));
  }, [fileId]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[90vw] max-w-3xl h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">{fileName}</h2>
              {fileInfo && (
                <p className="text-xs text-gray-400">
                  {fileInfo.file_type} • {formatSize(fileInfo.size)}
                  {fileInfo.tree_built && <span className="text-green-400 ml-2">✓ Indexed</span>}
                  {!fileInfo.tree_built && <span className="text-yellow-400 ml-2">⏳ Processing</span>}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-3 text-gray-400">
                <svg className="w-5 h-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Loading parsed content...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-red-400 text-sm">{error}</p>
                <button
                  onClick={onClose}
                  className="mt-3 text-xs text-gray-400 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {!loading && !error && content && (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-700 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {content ? `${content.length.toLocaleString()} characters` : ''}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
