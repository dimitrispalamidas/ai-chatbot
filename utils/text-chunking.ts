import mammoth from 'mammoth';

export interface TextChunk {
  content: string;
  index: number;
}

export function chunkText(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
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
    startIndex = endIndex - overlap;
    
    // Ensure we're making progress
    if (startIndex <= chunks[chunks.length - 1]?.content.length) {
      startIndex = endIndex;
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

export async function extractTextFromFile(
  content: string | ArrayBuffer,
  fileType: string,
  filename?: string
): Promise<string> {
  // Handle binary files (PDF, Word)
  if (content instanceof ArrayBuffer) {
    const buffer = Buffer.from(content);
    
    if (fileType === 'application/pdf' || filename?.toLowerCase().endsWith('.pdf')) {
      try {
        // Use require for server-side PDF parsing (Next.js API routes run in Node.js)
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);
        return data.text;
      } catch (error) {
        console.error('Error parsing PDF:', error);
        throw new Error('Failed to parse PDF file');
      }
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

