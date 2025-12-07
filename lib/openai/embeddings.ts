import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  
  return response.data[0].embedding;
}

/**
 * Estimate token count (rough approximation: 1 token ≈ 4 characters)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Generate embeddings for multiple texts with automatic batching
 * Handles large batches by splitting into smaller chunks to stay under token limits
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const MAX_TOKENS_PER_BATCH = 250000; // Leave margin under 300k limit
  const allEmbeddings: number[][] = [];
  
  // Group texts into batches that don't exceed token limit
  const batches: string[][] = [];
  let currentBatch: string[] = [];
  let currentBatchTokens = 0;
  
  for (const text of texts) {
    const textTokens = estimateTokens(text);
    
    // If adding this text would exceed the limit, start a new batch
    if (currentBatchTokens + textTokens > MAX_TOKENS_PER_BATCH && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [text];
      currentBatchTokens = textTokens;
    } else {
      currentBatch.push(text);
      currentBatchTokens += textTokens;
    }
  }
  
  // Add the last batch if it has items
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }
  
  // Process batches sequentially
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchTokens = batch.reduce((sum, text) => sum + estimateTokens(text), 0);
    console.log(`Processing embedding batch ${i + 1}/${batches.length} (${batch.length} texts, ~${batchTokens} tokens)`);
    
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch,
      });
      
      const batchEmbeddings = response.data.map(item => item.embedding);
      allEmbeddings.push(...batchEmbeddings);
      
      // Small delay between batches to avoid rate limiting
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error: any) {
      console.error(`Error processing batch ${i + 1}:`, error);
      throw new Error(`Failed to generate embeddings for batch ${i + 1}: ${error?.message || 'Unknown error'}`);
    }
  }
  
  return allEmbeddings;
}

