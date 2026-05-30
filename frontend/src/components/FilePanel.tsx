'use client';

import { useState, useRef, useEffect } from 'react';
import { uploadFileWithProgress, listFiles, deleteFile } from '@/lib/api';

interface FilePanelProps {
  selectedFileIds: number[];
  onToggleFile: (id: number) => void;
}

interface UploadedFile {
  id: number;
  name: string;
  file_type: string;
  tree_built: boolean;
}

// Simulated progress for indexing files
function useIndexingProgress(files: UploadedFile[]) {
  const [progress, setProgress] = useState<Record<number, number>>({});
  const timersRef = useRef<Record<number, NodeJS.Timeout>>({});

  useEffect(() => {
    for (const file of files) {
      if (!file.tree_built && !timersRef.current[file.id]) {
        // Start simulated progress for this file
        setProgress((p) => ({ ...p, [file.id]: 5 }));
        timersRef.current[file.id] = setInterval(() => {
          setProgress((p) => {
            const current = p[file.id] || 5;
            // Slow down as it approaches 90%
            const increment = current < 30 ? 3 : current < 60 ? 2 : current < 80 ? 1 : 0.5;
            const next = Math.min(current + increment, 92);
            return { ...p, [file.id]: next };
          });
        }, 1000);
      }
      if (file.tree_built && timersRef.current[file.id]) {
        // Done — jump to 100%
        clearInterval(timersRef.current[file.id]);
        delete timersRef.current[file.id];
        setProgress((p) => ({ ...p, [file.id]: 100 }));
      }
    }

    return () => {
      Object.values(timersRef.current).forEach(clearInterval);
    };
  }, [files]);

  return progress;
}

export function FilePanel({ selectedFileIds, onToggleFile }: FilePanelProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const indexingProgress = useIndexingProgress(files);

  // Load files on mount and poll for tree_built status
  useEffect(() => {
    loadFiles();
    pollRef.current = setInterval(loadFiles, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const loadFiles = async () => {
    try {
      const data = await listFiles();
      setFiles(data);
    } catch {}
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await doUpload(file);
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await doUpload(file);
  };

  const doUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    try {
      const uploaded = await uploadFileWithProgress(file, (percent) => {
        setUploadProgress(percent);
      });
      setFiles((prev) => [...prev, uploaded]);
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (fileId: number) => {
    try {
      await deleteFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {}
  };

  return (
    <div className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-400 uppercase">Files</h2>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="m-3 p-4 border-2 border-dashed border-gray-700 rounded-lg text-center cursor-pointer hover:border-blue-500"
        onClick={() => fileInputRef.current?.click()}
      >
        <p className="text-sm text-gray-400">
          {uploading ? 'Uploading...' : 'Drop files here or click to upload'}
        </p>
        {uploading && (
          <div className="mt-2 w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-2 rounded-full animate-pulse"
              style={{ width: `${Math.max(uploadProgress, 30)}%` }}
            />
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleUpload}
          className="hidden"
          accept=".pdf,.docx,.txt,.csv,.xlsx,.pptx,.html,.json,.xml,.png,.jpg,.mp3,.wav"
        />
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-3">
        {files.map((file) => (
          <div key={file.id} className="group">
            <div className="flex items-center gap-2 py-2 px-2 rounded hover:bg-gray-800">
              <input
                type="checkbox"
                checked={selectedFileIds.includes(file.id)}
                onChange={() => onToggleFile(file.id)}
                className="rounded border-gray-600"
              />
              <span className="text-sm truncate flex-1">{file.name}</span>
              {/* {!file.tree_built && (
                <span className="text-xs text-yellow-500"></span>
              )} */}
              {/* {file.tree_built && (
                <span className="text-xs text-green-500">✓</span>
              )} */}
              <button
                onClick={() => handleDelete(file.id)}
                className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                title="Delete file"
              >
                ✕
              </button>
            </div>
            {!file.tree_built && (
              <div className="mx-2 mb-1 bg-gray-700 rounded-full h-1.5 overflow-hidden" style={{ width: 'calc(100% - 16px)' }}>
                <div
                  className="bg-yellow-500 h-1.5 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${indexingProgress[file.id] || 5}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
