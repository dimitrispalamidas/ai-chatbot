import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');
    const userId = searchParams.get('userId') || 'anonymous';

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID required' },
        { status: 400 }
      );
    }

    // Fetch document from database
    const { data: document, error } = await supabaseAdmin
      .from('documents')
      .select('id, filename, file_path, file_type')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();

    if (error || !document) {
      console.error('Error fetching document:', error);
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    if (!document.file_path) {
      return NextResponse.json(
        { error: 'File path not found' },
        { status: 404 }
      );
    }

    // Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('documents')
      .download(document.file_path);

    if (downloadError || !fileData) {
      console.error('Error downloading file:', downloadError);
      return NextResponse.json(
        { error: 'Failed to download file' },
        { status: 500 }
      );
    }

    // Convert blob to buffer
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Get content type
    const contentType = document.file_type || 'application/octet-stream';
    
    // Determine if file should be displayed inline (PDFs, images) or downloaded
    const isViewable = contentType === 'application/pdf' || 
                       contentType.startsWith('image/') || 
                       contentType.startsWith('text/');

    // Prepare Content-Disposition header with original filename
    // Use both ASCII fallback and UTF-8 encoded version for maximum browser compatibility
    const asciiFilename = document.filename.replace(/[^\x20-\x7E]/g, '_');
    const utf8Filename = encodeURIComponent(document.filename);
    
    // For PDFs, use inline with filename so PDF viewer shows correct name
    // For other viewable files, include filename
    // For downloadable files, use attachment with filename
    let disposition: string;
    if (contentType === 'application/pdf') {
      // PDFs: inline with filename - PDF viewer will use this
      disposition = `inline; filename="${asciiFilename}"; filename*=UTF-8''${utf8Filename}`;
    } else if (isViewable) {
      // Other viewable files: inline with filename
      disposition = `inline; filename="${asciiFilename}"; filename*=UTF-8''${utf8Filename}`;
    } else {
      // Downloadable files: attachment with filename
      disposition = `attachment; filename="${asciiFilename}"; filename*=UTF-8''${utf8Filename}`;
    }

    // Return file with proper headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        'Content-Length': buffer.length.toString(),
        'X-Content-Type-Options': 'nosniff',
        // Allow browser to display PDFs inline
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

