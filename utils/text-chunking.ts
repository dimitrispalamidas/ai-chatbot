import * as mammoth from 'mammoth';

// Lazy load pdf-parse to handle CommonJS module in Next.js
let pdfParseModule: any = null;
const getPdfParse = () => {
  if (!pdfParseModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    pdfParseModule = require('pdf-parse');
  }
  return pdfParseModule;
};

export interface TextChunk {
  content: string;
  index: number;
}

export function chunkText(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 500
): TextChunk[] {
  const chunks: TextChunk[] = [];
  
  // Clean and normalize text
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  if (cleanText.length === 0) {
    return chunks;
  }
  
  let startIndex = 0;
  let chunkIndex = 0;
  
  while (startIndex < cleanText.length) {
    // Calculate end index
    let endIndex = startIndex + chunkSize;
    
    // If we're not at the end, try to break at a sentence or word boundary
    if (endIndex < cleanText.length) {
      // Look for sentence endings
      const sentenceEnd = cleanText.lastIndexOf('. ', endIndex);
      const questionEnd = cleanText.lastIndexOf('? ', endIndex);
      const exclamationEnd = cleanText.lastIndexOf('! ', endIndex);
      
      const sentenceBoundary = Math.max(sentenceEnd, questionEnd, exclamationEnd);
      
      if (sentenceBoundary > startIndex) {
        endIndex = sentenceBoundary + 1;
      } else {
        // If no sentence boundary, look for word boundary
        const wordBoundary = cleanText.lastIndexOf(' ', endIndex);
        if (wordBoundary > startIndex) {
          endIndex = wordBoundary;
        }
      }
    }
    
    const chunkContent = cleanText.slice(startIndex, endIndex).trim();
    
    if (chunkContent.length > 0) {
      chunks.push({
        content: chunkContent,
        index: chunkIndex,
      });
      chunkIndex++;
    }
    
    // Move start index forward, accounting for overlap
    const previousStartIndex = startIndex;
    startIndex = endIndex - overlap;
    
    // Ensure we're making progress - if we didn't advance, skip the overlap
    if (startIndex <= previousStartIndex) {
      startIndex = endIndex;
    }
    
    // Safety check: if we're not making progress, break to avoid infinite loop
    if (startIndex >= cleanText.length) {
      break;
    }
  }
  
  return chunks;
}

export function isBinaryFileType(fileType: string): boolean {
  return (
    fileType === 'application/pdf' ||
    fileType === 'application/msword' ||
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileType.startsWith('application/vnd.ms-word')
  );
}

export function getFileTypeFromName(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xml':
      return 'application/xml';
    case 'txt':
      return 'text/plain';
    case 'md':
      return 'text/markdown';
    case 'json':
      return 'application/json';
    case 'html':
    case 'htm':
      return 'text/html';
    default:
      return 'text/plain';
  }
}

/**
 * PDF text extraction using pdf-parse v1 (Node.js compatible)
 * Works reliably in serverless environments like Vercel
 */
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = getPdfParse();
    const data = await pdfParse(buffer);

    if (!data.text || data.text.trim().length === 0) {
      throw new Error('No text could be extracted from PDF');
    }

    // Normalize whitespace
    return data.text.replace(/\s+/g, ' ').trim();
  } catch (error: any) {
    if (error?.message?.includes('password') || error?.message?.includes('encrypted')) {
      throw new Error('PDF is password-protected and cannot be processed');
    }

    if (error?.message?.includes('Invalid PDF') || error?.message?.includes('corrupted')) {
      throw new Error('Invalid or corrupted PDF file');
    }

    if (error?.message?.includes('Missing PDF') || error?.message?.includes('empty')) {
      throw new Error('PDF file appears to be empty or corrupted');
    }

    console.error('PDF extraction error:', {
      name: error?.name,
      message: error?.message,
    });

    throw new Error(
      `Failed to extract text from PDF: ${error?.message || 'Unknown error'}`
    );
  }
}

export async function extractTextFromFile(
  content: string | ArrayBuffer,
  fileType: string,
  filename?: string
): Promise<string> {
  // Handle binary files (PDF, Word)
  if (content instanceof ArrayBuffer) {
    const buffer = Buffer.from(content);
    
    if (fileType === 'application/pdf' || filename?.toLowerCase().endsWith('.pdf')) {
      return await extractTextFromPDF(buffer);
    }
    
    if (
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      filename?.toLowerCase().endsWith('.docx')
    ) {
      try {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      } catch (error) {
        console.error('Error parsing Word document:', error);
        throw new Error('Failed to parse Word document');
      }
    }
    
    // Old .doc format is not supported by mammoth
    if (fileType === 'application/msword' || filename?.toLowerCase().endsWith('.doc')) {
      throw new Error('Old Word format (.doc) is not supported. Please convert to .docx format.');
    }
    
    throw new Error('Unsupported binary file type');
  }
  
  // Handle text files
  const textContent = content as string;
  
  switch (fileType) {
    case 'text/plain':
    case 'text/markdown':
    case 'application/json':
      return textContent;
    
    case 'text/html':
      // Basic HTML tag removal
      return textContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    case 'application/xml':
    case 'text/xml':
      // Parse XML and extract text content
      try {
        // Remove XML tags and extract text
        return textContent
          .replace(/<[^>]*>/g, ' ')
          .replace(/<!--[\s\S]*?-->/g, ' ') // Remove comments
          .replace(/\s+/g, ' ')
          .trim();
      } catch (error) {
        console.error('Error parsing XML:', error);
        // Fallback to basic tag removal
        return textContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    
    default:
      // Try to detect XML by content
      if (textContent.trim().startsWith('<?xml') || textContent.trim().startsWith('<')) {
        return textContent
          .replace(/<[^>]*>/g, ' ')
          .replace(/<!--[\s\S]*?-->/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      return textContent;
  }
}

