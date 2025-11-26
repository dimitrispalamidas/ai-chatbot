export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      documents: {
        Row: {
          id: string;
          created_at: string | null;
          updated_at: string | null;
          name: string;
          file_path: string;
          file_type: string;
          file_size: number;
          status: string;
          error_message: string | null;
          content: string | null;
          user_id: string | null;
          filename: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string | null;
          updated_at?: string | null;
          name: string;
          file_path: string;
          file_type: string;
          file_size: number;
          status?: string;
          error_message?: string | null;
          content?: string | null;
          user_id?: string | null;
          filename?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string | null;
          updated_at?: string | null;
          name?: string;
          file_path?: string;
          file_type?: string;
          file_size?: number;
          status?: string;
          error_message?: string | null;
          content?: string | null;
          user_id?: string | null;
          filename?: string | null;
        };
      };
      document_chunks: {
        Row: {
          id: string;
          created_at: string | null;
          document_id: string;
          content: string;
          embedding: string | null;
          chunk_index: number;
          token_count: number;
        };
        Insert: {
          id?: string;
          created_at?: string | null;
          document_id: string;
          content: string;
          embedding?: string | null;
          chunk_index: number;
          token_count: number;
        };
        Update: {
          id?: string;
          created_at?: string | null;
          document_id?: string;
          content?: string;
          embedding?: string | null;
          chunk_index?: number;
          token_count?: number;
        };
      };
      chat_sessions: {
        Row: {
          id: string;
          created_at: string | null;
          updated_at: string | null;
          title: string;
          user_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string | null;
          updated_at?: string | null;
          title?: string;
          user_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string | null;
          updated_at?: string | null;
          title?: string;
          user_id?: string | null;
        };
      };
      chat_messages: {
        Row: {
          id: string;
          created_at: string | null;
          session_id: string;
          role: string;
          content: string;
          relevant_chunks: string[] | null;
        };
        Insert: {
          id?: string;
          created_at?: string | null;
          session_id: string;
          role: string;
          content: string;
          relevant_chunks?: string[] | null;
        };
        Update: {
          id?: string;
          created_at?: string | null;
          session_id?: string;
          role?: string;
          content?: string;
          relevant_chunks?: string[] | null;
        };
      };
    };
    Functions: {
      match_document_chunks: {
        Args: {
          query_embedding: number[];
          match_threshold: number;
          match_count: number;
        };
        Returns: {
          id: string;
          document_id: string;
          content: string;
          similarity: number;
        }[];
      };
    };
  };
}
