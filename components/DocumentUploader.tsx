'use client';

import { useState } from 'react';

interface Document {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

interface DocumentUploaderProps {
  documents: Document[];
  onUploadComplete: () => void;
}

export default function DocumentUploader({ documents, onUploadComplete }: DocumentUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', 'anonymous'); // You can replace with actual user ID

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      onUploadComplete();
      e.target.value = ''; // Reset input
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!confirm('Είσαι σίγουρος ότι θέλεις να διαγράψεις αυτό το έγγραφο;')) {
      return;
    }

    setDeleting(documentId);
    try {
      const response = await fetch(`/api/upload?documentId=${documentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      onUploadComplete();
    } catch (err) {
      setError('Failed to delete document');
    } finally {
      setDeleting(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('el-GR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Upload Section */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
          Έγγραφα
        </h2>
        
        <label className="block w-full">
          <input
            type="file"
            onChange={handleFileUpload}
            disabled={uploading}
            accept=".txt,.md,.json,.html"
            className="hidden"
          />
          <div className="flex items-center justify-center w-full h-32 px-4 transition bg-white dark:bg-zinc-900 border-2 border-zinc-300 dark:border-zinc-700 border-dashed rounded-lg appearance-none cursor-pointer hover:border-blue-500 focus:outline-none">
            <div className="text-center">
              {uploading ? (
                <div className="text-zinc-600 dark:text-zinc-400">
                  Ανέβασμα...
                </div>
              ) : (
                <>
                  <svg
                    className="w-8 h-8 mx-auto mb-2 text-zinc-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    Κλικ για ανέβασμα
                  </span>
                  <p className="text-xs text-zinc-500 mt-1">
                    TXT, MD, JSON, HTML
                  </p>
                </>
              )}
            </div>
          </div>
        </label>

        {error && (
          <div className="mt-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Documents List */}
      <div className="flex-1 overflow-y-auto p-4">
        {documents.length === 0 ? (
          <div className="text-center text-zinc-400 py-8">
            <p>Δεν υπάρχουν έγγραφα</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {doc.filename}
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {formatFileSize(doc.file_size)} • {formatDate(doc.created_at)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    disabled={deleting === doc.id}
                    className="ml-2 text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

