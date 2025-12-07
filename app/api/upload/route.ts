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

    // Read file content - handle binary files
    let extractedText: string;
    const fileType = file.type || getFileTypeFromName(file.name);
    
    try {
      if (isBinaryFileType(fileType)) {
        const arrayBuffer = await file.arrayBuffer();
        console.log('Extracting text from binary file, buffer size:', arrayBuffer.byteLength);
        extractedText = await extractTextFromFile(arrayBuffer, fileType, file.name);
      } else {
        const fileContent = await file.text();
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
        file_path: `/uploads/${userId}/${file.name}`,
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
      // Clean up document if chunks fail
      await supabaseAdmin.from('documents').delete().eq('id', document.id);
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

    // Delete chunks first (foreign key constraint)
    await supabaseAdmin
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

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

