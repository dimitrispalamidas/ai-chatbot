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

export function extractTextFromFile(content: string, fileType: string): string {
  // For now, we'll handle text files directly
  // You can extend this to handle PDFs, DOCs, etc.
  
  switch (fileType) {
    case 'text/plain':
    case 'text/markdown':
    case 'application/json':
      return content;
    
    case 'text/html':
      // Basic HTML tag removal
      return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    default:
      return content;
  }
}

