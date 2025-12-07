import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { generateEmbeddings } from '@/lib/openai/embeddings';
import { chunkText, extractTextFromFile, isBinaryFileType, getFileTypeFromName } from '@/utils/text-chunking';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string || 'anonymous';

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    console.log('Upload started:', { filename: file.name, size: file.size, type: file.type });

    const fileType = file.type || getFileTypeFromName(file.name);
    const fileBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(fileBuffer);

    // Sanitize filename for storage (URL-safe, preserve extension)
    const sanitizeFilename = (filename: string): string => {
      // Get file extension
      const lastDot = filename.lastIndexOf('.');
      const name = lastDot > 0 ? filename.substring(0, lastDot) : filename;
      const ext = lastDot > 0 ? filename.substring(lastDot) : '';
      
      // Replace non-ASCII and special characters with underscores
      // Keep alphanumeric, dots, hyphens, and underscores
      const sanitized = name
        .normalize('NFD') // Decompose characters (e.g., é -> e + ´)
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace invalid chars with underscore
        .replace(/_{2,}/g, '_') // Replace multiple underscores with single
        .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
      
      // Ensure we have at least some name (fallback to 'file')
      const finalName = sanitized || 'file';
      
      return `${finalName}${ext}`;
    };

    const sanitizedFilename = sanitizeFilename(file.name);
    const storagePath = `${userId}/${Date.now()}-${sanitizedFilename}`;
    console.log('Uploading file to storage:', storagePath, '(original:', file.name, ')');
    
    const { error: uploadError } = await supabaseAdmin.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: fileType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Error uploading file to storage:', uploadError);
      return NextResponse.json(
        { error: `Failed to upload file: ${uploadError.message}` },
        { status: 500 }
      );
    }
    console.log('File uploaded to storage successfully');

    // Read file content - handle binary files
    let extractedText: string;
    
    try {
      if (isBinaryFileType(fileType)) {
        console.log('Extracting text from binary file, buffer size:', buffer.byteLength);
        extractedText = await extractTextFromFile(fileBuffer, fileType, file.name);
      } else {
        const fileContent = buffer.toString('utf-8');
        console.log('Extracting text from text file, content length:', fileContent.length);
        extractedText = await extractTextFromFile(fileContent, fileType, file.name);
      }
      console.log('Text extracted successfully, length:', extractedText.length);
    } catch (extractError: any) {
      console.error('Text extraction failed:', {
        error: extractError,
        message: extractError?.message,
        stack: extractError?.stack,
        filename: file.name,
        fileType,
      });
      // Clean up uploaded file if text extraction fails
      await supabaseAdmin.storage.from('documents').remove([storagePath]);
      return NextResponse.json(
        { error: `Failed to extract text: ${extractError?.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    // Insert document
    console.log('Inserting document into database...');
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .insert({
        user_id: userId,
        name: file.name,
        filename: file.name,
        file_path: storagePath,
        content: extractedText,
        file_type: fileType,
        file_size: file.size,
        status: 'completed',
      })
      .select()
      .single();

    if (docError || !document) {
      console.error('Error inserting document:', docError);
      return NextResponse.json(
        { error: `Failed to save document: ${docError?.message || 'Unknown error'}` },
        { status: 500 }
      );
    }
    console.log('Document inserted successfully:', document.id);

    // Create chunks
    console.log('Creating text chunks...');
    const chunks = chunkText(extractedText);
    console.log('Created', chunks.length, 'chunks');
    
    if (chunks.length === 0) {
      return NextResponse.json(
        { error: 'No content to process' },
        { status: 400 }
      );
    }

    // Generate embeddings for all chunks
    console.log('Generating embeddings for', chunks.length, 'chunks...');
    const embeddings = await generateEmbeddings(chunks.map(c => c.content));
    console.log('Generated', embeddings.length, 'embeddings');

    // Insert chunks with embeddings
    const chunksToInsert = chunks.map((chunk, idx) => ({
      document_id: document.id,
      content: chunk.content,
      embedding: embeddings[idx],
      chunk_index: chunk.index,
      token_count: Math.ceil(chunk.content.length / 4), // Approximate token count
    }));

    const { error: chunkError } = await supabaseAdmin
      .from('document_chunks')
      .insert(chunksToInsert);

    if (chunkError) {
      console.error('Error inserting chunks:', chunkError);
      // Clean up document and storage file if chunks fail
      await supabaseAdmin.from('documents').delete().eq('id', document.id);
      await supabaseAdmin.storage.from('documents').remove([document.file_path]);
      return NextResponse.json(
        { error: `Failed to process document chunks: ${chunkError?.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    console.log('Upload completed successfully');
    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        filename: document.filename,
        chunksCount: chunks.length,
      },
    });
  } catch (error: any) {
    console.error('Upload error:', {
      error,
      message: error?.message,
      stack: error?.stack,
    });
    return NextResponse.json(
      { error: `Internal server error: ${error?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'anonymous';
    const documentId = searchParams.get('documentId');

    // If documentId is provided, fetch a single document with content and signed URL
    if (documentId) {
      const { data: document, error } = await supabaseAdmin
        .from('documents')
        .select('id, filename, file_type, file_size, created_at, content, file_path')
        .eq('id', documentId)
        .eq('user_id', userId)
        .single();

      if (error || !document) {
        console.error('Error fetching document:', error);
        return NextResponse.json(
          { error: 'Failed to fetch document' },
          { status: 500 }
        );
      }

      // Generate signed URL for file access (valid for 1 hour)
      let fileUrl = null;
      if (document.file_path) {
        const { data: urlData } = await supabaseAdmin.storage
          .from('documents')
          .createSignedUrl(document.file_path, 3600);
        fileUrl = urlData?.signedUrl || null;
      }

      return NextResponse.json({ 
        document: {
          ...document,
          file_url: fileUrl
        }
      });
    }

    // Otherwise, fetch all documents (without content for performance)
    const { data: documents, error } = await supabaseAdmin
      .from('documents')
      .select('id, filename, file_type, file_size, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching documents:', error);
      return NextResponse.json(
        { error: 'Failed to fetch documents' },
        { status: 500 }
      );
    }

    return NextResponse.json({ documents });
  } catch (error) {
    console.error('Fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID required' },
        { status: 400 }
      );
    }

    // Get document to find file path before deletion
    const { data: document } = await supabaseAdmin
      .from('documents')
      .select('file_path')
      .eq('id', documentId)
      .single();

    // Delete chunks first (foreign key constraint)
    await supabaseAdmin
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    // Delete file from storage if it exists
    if (document?.file_path) {
      await supabaseAdmin.storage
        .from('documents')
        .remove([document.file_path]);
    }

    // Delete document
    const { error } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (error) {
      console.error('Error deleting document:', error);
      return NextResponse.json(
        { error: 'Failed to delete document' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

