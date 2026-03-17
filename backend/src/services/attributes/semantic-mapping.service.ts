import OpenAI from 'openai';
import oracledb from 'oracledb';
import { withConnection } from '../oracle-pool.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config.js';

export interface SemanticMatch {
  term: string;
  targetId: string;
  targetDesc: string;
  similarity: number;
}

export class SemanticMappingService {
  private openai: OpenAI | null = null;

  constructor() {
    if (config.llm.openaiApiKey) {
      this.openai = new OpenAI({ apiKey: config.llm.openaiApiKey });
    }
  }

  /**
   * Get embedding for a term (with caching)
   */
  async getEmbedding(term: string): Promise<number[]> {
    const normalizedTerm = term.toLowerCase().trim();
    const model = 'text-embedding-3-small';

    return withConnection(async (conn) => {
      // 1. Check cache
      const cached = await conn.execute(
        `SELECT VECTOR_JSON FROM ATTRIBUTE_EMBEDDING_CACHE 
         WHERE TERM = :term AND MODEL = :model`,
        { term: normalizedTerm, model },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (cached.rows && cached.rows.length > 0) {
        const row: any = cached.rows[0];
        const vectorJson = typeof row.VECTOR_JSON === 'string' 
          ? row.VECTOR_JSON 
          : await this.readClob(row.VECTOR_JSON);
        return JSON.parse(vectorJson);
      }

      // 2. Fetch from OpenAI if not cached
      if (!this.openai) {
        throw new Error('OpenAI API key missing - cannot generate embeddings');
      }

      logger.info('Generating embedding via OpenAI', { term: normalizedTerm });
      const response = await this.openai.embeddings.create({
        model,
        input: normalizedTerm,
      });

      const vector = response.data[0].embedding;

      // 3. Cache it
      await conn.execute(
        `INSERT INTO ATTRIBUTE_EMBEDDING_CACHE (TERM, VECTOR_JSON, MODEL) 
         VALUES (:term, :vector, :model)`,
        { term: normalizedTerm, vector: JSON.stringify(vector), model },
        { autoCommit: true }
      );

      return vector;
    });
  }

  /**
   * Get embeddings for multiple terms (efficient)
   */
  async getEmbeddingsBatch(terms: string[]): Promise<Map<string, number[]>> {
    const normalizedTerms = terms.map(t => t.toLowerCase().trim());
    const uniqueTerms = [...new Set(normalizedTerms)];
    const model = 'text-embedding-3-small';
    const result = new Map<string, number[]>();

    return withConnection(async (conn) => {
      // 1. Fetch all cached in one go
      const placeholders = uniqueTerms.map((_, i) => `:t${i}`).join(',');
      const binds: any = { model };
      uniqueTerms.forEach((t, i) => binds[`t${i}`] = t);

      const cached = await conn.execute(
        `SELECT TERM, VECTOR_JSON FROM ATTRIBUTE_EMBEDDING_CACHE 
         WHERE MODEL = :model AND TERM IN (${placeholders})`,
        binds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const cachedMap = new Map<string, number[]>();
      for (const row of (cached.rows as any[]) || []) {
        const vectorJson = typeof row.VECTOR_JSON === 'string' 
          ? row.VECTOR_JSON 
          : await this.readClob(row.VECTOR_JSON);
        cachedMap.set(row.TERM, JSON.parse(vectorJson));
      }

      // 2. Identify missing terms
      const missingTerms = uniqueTerms.filter(t => !cachedMap.has(t));

      // 3. Fetch missing from OpenAI (in chunks of 1000)
      if (missingTerms.length > 0) {
        if (!this.openai) throw new Error('OpenAI API key missing');
        
        const validMissingTerms = missingTerms.filter(t => t && t.length > 0);
        if (validMissingTerms.length > 0) {
          logger.info('Generating batch embeddings via OpenAI', { count: validMissingTerms.length });
          
          const chunkSize = 1000;
          for (let i = 0; i < validMissingTerms.length; i += chunkSize) {
            const chunk = validMissingTerms.slice(i, i + chunkSize);
            const response = await this.openai.embeddings.create({
              model,
              input: chunk,
            });

            for (let j = 0; j < chunk.length; j++) {
              const term = chunk[j];
              const vector = response.data[j].embedding;
              cachedMap.set(term, vector);

              // 4. Cache them
              await conn.execute(
                `INSERT INTO ATTRIBUTE_EMBEDDING_CACHE (TERM, VECTOR_JSON, MODEL) 
                 VALUES (:term, :vector, :model)`,
                { term, vector: JSON.stringify(vector), model },
                { autoCommit: false }
              );
            }
          }
          await conn.commit();
        }
      }

      return cachedMap;
    });
  }

  /**
   * Find best semantic match for an AI fact within a list of ERP characteristic values
   */
  async findBestMatch(
    aiFact: string, 
    candidates: Array<{ id: string; description: string }>
  ): Promise<SemanticMatch | null> {
    if (candidates.length === 0) return null;

    try {
      // 1. Get all embeddings in ONE connection
      const allTerms = [aiFact, ...candidates.map(c => c.description)];
      const embeddingMap = await this.getEmbeddingsBatch(allTerms);
      
      const factVector = embeddingMap.get(aiFact.toLowerCase().trim());
      if (!factVector) return null;

      const results: SemanticMatch[] = candidates.map((cand) => {
        const candVector = embeddingMap.get(cand.description.toLowerCase().trim());
        const similarity = candVector ? this.cosineSimilarity(factVector, candVector) : 0;
        return {
          term: aiFact,
          targetId: cand.id,
          targetDesc: cand.description,
          similarity
        };
      });

      // Sort by similarity descending
      results.sort((a, b) => b.similarity - a.similarity);
      
      const best = results[0];
      if (best && best.similarity > 0.7) {
        logger.debug('Semantic match found', { fact: aiFact, bestMatch: best.targetDesc, score: best.similarity });
        return best;
      }
      
      return null;
    } catch (err: any) {
      logger.error('Semantic matching failed', { error: err.message });
      return null;
    }
  }

  /**
   * Simple cosine similarity between two vectors
   */
  private cosineSimilarity(v1: number[], v2: number[]): number {
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;
    for (let i = 0; i < v1.length; i++) {
      dotProduct += v1[i] * v2[i];
      mag1 += v1[i] * v1[i];
      mag2 += v2[i] * v2[i];
    }
    return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
  }

  /**
   * Read CLOB content
   */
  private async readClob(clob: any): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';
      clob.setEncoding('utf8');
      clob.on('data', (chunk: string) => data += chunk);
      clob.on('end', () => resolve(data));
      clob.on('error', (err: any) => reject(err));
    });
  }
}

