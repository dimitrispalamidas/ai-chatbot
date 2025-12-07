'use client';

import { useState, useEffect } from 'react';
import ChatInterface from '@/components/ChatInterface';
import DocumentUploader from '@/components/DocumentUploader';

interface Document {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = async () => {
    try {
      const response = await fetch('/api/upload?userId=anonymous');
      
      if (!response.ok) {
        // If response is not OK, try to get error message
        let errorMessage = `Server error: ${response.status}`;
        try {
          const errorText = await response.text();
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorMessage;
          } catch {
            // If it's HTML (error page), just use status
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
          }
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        console.error('Failed to fetch documents:', errorMessage);
        setDocuments([]);
        return;
      }
      
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    fetchDocuments();
  }, []);

  return (
    <div className="flex h-screen bg-white dark:bg-black">
      {/* Sidebar - Documents */}
      <div className="w-80 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-zinc-400">Φόρτωση...</div>
          </div>
        ) : (
          <DocumentUploader documents={documents} onUploadComplete={fetchDocuments} />
        )}
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-16 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-6">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            AI Chatbot με RAG
          </h1>
        </div>

        {/* Chat Interface */}
        <div className="flex-1 overflow-hidden">
          <ChatInterface />
        </div>
      </div>
    </div>
  );
}
