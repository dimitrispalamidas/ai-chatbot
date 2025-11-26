import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { supabaseAdmin } from '@/lib/supabase/client';
import { generateEmbedding } from '@/lib/openai/embeddings';

export const maxDuration = 30;

async function retrieveRelevantChunks(query: string, topK: number = 5) {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Use Supabase's vector similarity search
    const { data, error } = await supabaseAdmin.rpc('match_document_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3, // Lowered threshold for better Greek language retrieval
      match_count: topK,
    });

    if (error) {
      console.error('Error retrieving chunks:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Retrieval error:', error);
    return [];
  }
}

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const messages = body?.messages || [];

    // Validate messages
    if (!Array.isArray(messages)) {
      console.error('Messages is not an array:', messages, 'body:', body);
      return new Response(
        JSON.stringify({ error: 'Messages must be an array' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Get the last user message for retrieval
    const lastUserMessage = messages
      .filter((m: any) => m.role === 'user')
      .slice(-1)[0]?.content || '';

    // Retrieve relevant document chunks
    const relevantChunks = await retrieveRelevantChunks(lastUserMessage);

    // Build context from retrieved chunks
    let context = '';
    if (relevantChunks.length > 0) {
      context = '\n\nΣχετικές πληροφορίες από τα έγγραφα:\n\n';
      relevantChunks.forEach((chunk: any, idx: number) => {
        context += `[${idx + 1}] ${chunk.content}\n\n`;
      });
    }

    // Create system message with context
    const systemMessage = {
      role: 'system' as const,
      content: `Είσαι ένας χρήσιμος βοηθός που απαντά σε ερωτήσεις βασιζόμενος σε έγγραφα που έχουν ανέβει από τον χρήστη.
      
Κανόνες:
1. Χρησιμοποίησε ΜΟΝΟ τις πληροφορίες από τα παρακάτω έγγραφα για να απαντήσεις
2. Αν δεν μπορείς να βρεις την απάντηση στα έγγραφα, πες το ξεκάθαρα
3. Μην εφευρίσκεις πληροφορίες που δεν υπάρχουν στα έγγραφα
4. Αναφέρε από ποιο κομμάτι του εγγράφου [αριθμός] βρήκες την πληροφορία
5. Απάντα στα Ελληνικά
${context}`,
    };

    // Combine system message with user messages
    const allMessages = [systemMessage, ...messages];

    const result = await streamText({
      model: openai('gpt-4o-mini'),
      messages: allMessages as any,
      temperature: 0.7,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Chat error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process chat request' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

