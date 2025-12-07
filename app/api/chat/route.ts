import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { supabaseAdmin } from '@/lib/supabase/client';
import { generateEmbedding } from '@/lib/openai/embeddings';

export const maxDuration = 30;

async function retrieveRelevantChunks(query: string, topK: number = 10) {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Use Supabase's vector similarity search with lower threshold for better Greek language retrieval
    const { data: vectorResults, error: vectorError } = await supabaseAdmin.rpc('match_document_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.30, // Lowered threshold to catch more relevant chunks, especially for Greek text
      match_count: topK,
    });

    if (vectorError) {
      console.error('Error retrieving chunks via vector search:', vectorError);
    }

    // Extract keywords from query for fallback text search
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3) // Filter out short words
      .slice(0, 5); // Take top 5 keywords

    // Fallback: keyword-based text search if vector search returns few results
    let keywordResults: any[] = [];
    if (!vectorResults || vectorResults.length < 3) {
      try {
        // Build ILIKE query for keyword search
        const keywordConditions = keywords.map(keyword => `content ILIKE '%${keyword}%'`).join(' OR ');
        
        if (keywordConditions) {
          const { data: textResults, error: textError } = await supabaseAdmin
            .from('document_chunks')
            .select('id, document_id, content')
            .or(keywordConditions)
            .limit(topK);

          if (!textError && textResults) {
            keywordResults = textResults.map((chunk: any) => ({
              ...chunk,
              similarity: 0.5, // Default similarity for keyword matches
            }));
          }
        }
      } catch (textSearchError) {
        console.error('Error in keyword search:', textSearchError);
      }
    }

    // Combine and deduplicate results
    const allResults = [...(vectorResults || []), ...keywordResults];
    const uniqueResults = new Map<string, any>();
    
    for (const result of allResults) {
      const key = result.id;
      if (!uniqueResults.has(key) || (result.similarity && result.similarity > (uniqueResults.get(key)?.similarity || 0))) {
        uniqueResults.set(key, result);
      }
    }

    // Sort by similarity (highest first) and limit
    const finalResults = Array.from(uniqueResults.values())
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, topK);

    console.log(`Retrieved ${finalResults.length} chunks (${vectorResults?.length || 0} from vector, ${keywordResults.length} from keywords)`);
    
    return finalResults;
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
      content: `Είσαι ένας ακριβής και αξιόπιστος βοηθός που απαντά ΑΠΟΚΛΕΙΣΤΙΚΑ με βάση έγγραφα που έχει ανεβάσει ο χρήστης.

⚠️ ΚΡΙΣΙΜΟΙ ΚΑΝΟΝΕΣ - ΤΗΡΗΣΗ ΥΠΟΧΡΕΩΤΙΚΗ:

1. ⛔ ΑΠΑΓΟΡΕΥΕΤΑΙ ΑΥΣΤΗΡΑ:
   - Να εφευρίσκεις ή να μαντεύεις πληροφορίες που ΔΕΝ υπάρχουν στα παρακάτω έγγραφα
   - Να χρησιμοποιείς τη γενική σου γνώση ή εξωτερικές πληροφορίες
   - Να αναφέρεις κανονισμούς, αριθμούς, ημερομηνίες ή ονόματα που δεν εμφανίζονται ρητά στα έγγραφα
   - Να δημιουργείς "πιθανές" ή "λογικές" απαντήσεις όταν δεν ξέρεις

2. ✅ ΥΠΟΧΡΕΩΤΙΚΗ ΣΥΜΠΕΡΙΦΟΡΑ:
   - Διάβασε προσεκτικά ΟΛΑ τα κομμάτια εγγράφων που σου δίνονται: [1], [2], [3]...
   - Χρησιμοποίησε ΜΟΝΟ πληροφορίες που βρίσκεις σε αυτά τα κομμάτια
   - Αν ΔΕΝ βρίσκεις την απάντηση στα έγγραφα, πες το ξεκάθαρα: "Δεν βρίσκω αυτή την πληροφορία στα έγγραφα που μου δόθηκαν"
   - Αναφέρε πάντα από ποιο κομμάτι [αριθμός] βρήκες κάθε πληροφορία

3. 📅 ΓΙΑ ΕΡΩΤΗΣΕΙΣ ΜΕ ΗΜΕΡΟΜΗΝΙΕΣ/ΧΡΟΝΟΛΟΓΙΕΣ:
   - Εξέτασε προσεκτικά ΟΛΑ τα κομμάτια [1], [2], [3]... για την ημερομηνία που ρωτιέται
   - Αναφέρε ΟΛΑ τα γεγονότα/έγγραφα/ενέργειες που σχετίζονται με αυτή την ημερομηνία
   - Αναφέρε ακριβείς αριθμούς κανονισμών (π.χ. "C(2021) 1982", "ACCC/C/2015/128")
   - Παρουσίασε ΟΛΕΣ τις λεπτομέρειες: τι έγινε, ποιος το έκανε, ποιο θέμα, ποιο συμπέρασμα

4. 🔍 ΠΟΙΟΤΗΤΑ ΑΠΑΝΤΗΣΗΣ:
   - Πλήρης και εξαντλητική απάντηση με ΟΛΕΣ τις σχετικές πληροφορίες
   - Χρησιμοποίησε τους ακριβείς αριθμούς και κωδικούς όπως εμφανίζονται
   - Μην παραλείπεις κανένα σχετικό στοιχείο
   - Απάντα στα Ελληνικά

5. ❌ ΑΝ ΔΕΝ ΥΠΑΡΧΕΙ Η ΠΛΗΡΟΦΟΡΙΑ:
   - Πες το ειλικρινά: "Η συγκεκριμένη πληροφορία δεν υπάρχει στα έγγραφα που μου δόθηκαν"
   - ΜΗΝ προσπαθήσεις να "βοηθήσεις" με γενικές γνώσεις ή εικασίες
   - ΜΗΝ αναφέρεις άλλα έγγραφα/κανονισμούς που δεν υπάρχουν στα chunks

${context}`,
    };

    // Combine system message with user messages
    const allMessages = [systemMessage, ...messages];

    const result = await streamText({
      model: openai('gpt-4o-mini'),
      messages: allMessages as any,
      temperature: 0.1, // Very low temperature for factual accuracy and consistency
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

