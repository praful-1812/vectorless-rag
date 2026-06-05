'use client';

import { useState, useRef, useEffect } from 'react';
import { uploadFileWithProgress, listFiles, deleteFile } from '@/lib/api';
import { FileContentViewer } from './FileContentViewer';

interface FilePanelProps {
  selectedFileIds: number[];
  onToggleFile: (id: number) => void;
  onSelectAll?: (ids: number[]) => void;
  onClose?: () => void;
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

export function FilePanel({ selectedFileIds, onToggleFile, onSelectAll, onClose }: FilePanelProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [viewingFile, setViewingFile] = useState<{ id: number; name: string } | null>(null);
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

  const MAX_FILES_AT_ONCE = 10;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;
    if (selectedFiles.length > MAX_FILES_AT_ONCE) {
      alert(`You can upload a maximum of ${MAX_FILES_AT_ONCE} files at once.`);
      e.target.value = '';
      return;
    }
    await doUploadBatch(selectedFiles);
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length === 0) return;
    if (droppedFiles.length > MAX_FILES_AT_ONCE) {
      alert(`You can upload a maximum of ${MAX_FILES_AT_ONCE} files at once.`);
      return;
    }
    await doUploadBatch(droppedFiles);
  };

  const doUploadBatch = async (filesToUpload: File[]) => {
    setUploading(true);
    setUploadProgress(0);
    const total = filesToUpload.length;
    let completed = 0;

    for (const file of filesToUpload) {
      try {
        const uploaded = await uploadFileWithProgress(file, (percent) => {
          const overallProgress = ((completed + percent / 100) / total) * 100;
          setUploadProgress(Math.round(overallProgress));
        });
        setFiles((prev) => [...prev, uploaded]);
        completed++;
        setUploadProgress(Math.round((completed / total) * 100));
      } catch (err: any) {
        alert(`Upload failed for "${file.name}": ${err.message}`);
      }
    }

    setUploading(false);
    setUploadProgress(0);
  };

  const handleDelete = async (fileId: number) => {
    try {
      await deleteFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {}
  };

  return (
    <div className="w-full h-full bg-gray-900 border-l border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-400 uppercase">Sources</h2>
        <div className="flex items-center gap-1">
          {onClose && (
            <button
              onClick={onClose}
              className="group p-1.5 rounded-lg hover:bg-gray-800 transition-all duration-200"
              title="Collapse panel"
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
          )}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="m-3 p-4 border-2 border-dashed border-gray-700 rounded-lg text-center cursor-pointer hover:border-blue-500"
        onClick={() => fileInputRef.current?.click()}
      >
        <p className="text-sm text-gray-400">
          {uploading ? 'Uploading...' : 'Drop files here or click to upload (max 10)'}
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
          multiple
          onChange={handleUpload}
          className="hidden"
          accept=".pdf,.docx,.txt,.csv,.xlsx,.pptx,.html,.json,.xml,.png,.jpg,.mp3,.wav"
        />
      </div>

      {/* Select All button */}
      {onSelectAll && files.length > 0 && (
        <div className="px-3 pt-2 pb-1">
          <button
            onClick={() => {
              const allIds = files.map((f) => f.id);
              const allSelected = allIds.every((id) => selectedFileIds.includes(id));
              onSelectAll(allSelected ? [] : allIds);
            }}
            className="w-full px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-blue-400 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-left"
          >
            {files.every((f) => selectedFileIds.includes(f.id)) ? '☑ Deselect All' : '☐ Select All'}
          </button>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-3">
        {files.map((file) => (
          <FileItem
            key={file.id}
            file={file}
            selected={selectedFileIds.includes(file.id)}
            onToggle={() => onToggleFile(file.id)}
            onDelete={() => handleDelete(file.id)}
            onView={() => setViewingFile({ id: file.id, name: file.name })}
            indexingProgress={indexingProgress[file.id]}
          />
        ))}
      </div>

      {/* File content viewer modal */}
      {viewingFile && (
        <FileContentViewer
          fileId={viewingFile.id}
          fileName={viewingFile.name}
          onClose={() => setViewingFile(null)}
        />
      )}
    </div>
  );
}

// Individual file item with options menu
function FileItem({ file, selected, onToggle, onDelete, onView, indexingProgress }: {
  file: UploadedFile;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onView: () => void;
  indexingProgress?: number;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="mb-1">
      <div className="flex items-center py-3 px-2 rounded-lg hover:bg-gray-800 group">
        <button
          onClick={onToggle}
          className={`w-5 h-5 rounded-md border-2 mr-4 flex items-center justify-center transition-colors flex-shrink-0 ${
            selected ? 'bg-white border-white' : 'border-gray-500 hover:border-white'
          }`}
        >
          {selected && (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        <span
          className="text-[13px] truncate flex-1 cursor-pointer hover:text-blue-400 transition-colors"
          onClick={onView}
          title="Click to view parsed content"
        >
          {file.name}
        </span>
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
            title="Options"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-7 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[120px]">
                <button
                  onClick={() => { onView(); setShowMenu(false); }}
                  className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 rounded"
                >
                  👁 View content
                </button>
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
      </div>
      {!file.tree_built && (
        <div className="mx-2 mb-1 bg-gray-700 rounded-full h-1.5 overflow-hidden" style={{ width: 'calc(100% - 16px)' }}>
          <div
            className="bg-yellow-500 h-1.5 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${indexingProgress || 5}%` }}
          />
        </div>
      )}
    </div>
  );
}
