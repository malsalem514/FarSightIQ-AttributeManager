/**
 * LLM Cache Service
 * 
 * Caches LLM responses to reduce API calls and costs
 * Uses node-cache (in-memory) with 30-day TTL
 */

import NodeCache from 'node-cache';
import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import type { AttributeExtractionResult } from './types.js';

/**
 * LLM Cache Service
 * 
 * Features:
 * - 30-day TTL (matches AttributeME_IQ behavior)
 * - Image hash-based keys (same image → same cache entry)
 * - Hit/miss tracking
 */
export class LLMCacheService {
  private cache: NodeCache;
  private hits: number = 0;
  private misses: number = 0;

  constructor(ttlSeconds: number = 2592000) { // 30 days
    this.cache = new NodeCache({
      stdTTL: ttlSeconds,
      checkperiod: 600, // Check for expired keys every 10 minutes
      useClones: false, // Don't clone objects (performance)
    });

    logger.info('LLM cache initialized', { ttlSeconds, ttlDays: ttlSeconds / 86400 });
  }

  /**
   * Get cached result for image
   * 
   * @param imageBase64 - Base64-encoded image
   * @returns Cached result or null if not found
   */
  get(imageBase64: string): AttributeExtractionResult | null {
    const key = this.hashImage(imageBase64);
    const cached = this.cache.get<AttributeExtractionResult>(key);

    if (cached) {
      this.hits++;
      logger.debug('LLM cache hit', { key, hitRate: this.getHitRate() });
      return cached;
    }

    this.misses++;
    logger.debug('LLM cache miss', { key, hitRate: this.getHitRate() });
    return null;
  }

  /**
   * Store result in cache
   * 
   * @param imageBase64 - Base64-encoded image
   * @param result - Extraction result to cache
   */
  set(imageBase64: string, result: AttributeExtractionResult): void {
    const key = this.hashImage(imageBase64);
    this.cache.set(key, result);
    logger.debug('LLM cache set', { key, styleId: result.styleId });
  }

  /**
   * Clear all cached results
   */
  clear(): void {
    this.cache.flushAll();
    this.hits = 0;
    this.misses = 0;
    logger.info('LLM cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: this.getHitRate(),
      keys: this.cache.keys().length,
    };
  }

  /**
   * Hash image for cache key
   * 
   * Uses SHA-256 to create consistent key from image data
   */
  private hashImage(imageBase64: string): string {
    return crypto.createHash('sha256').update(imageBase64).digest('hex');
  }

  /**
   * Calculate cache hit rate
   */
  private getHitRate(): number {
    const total = this.hits + this.misses;
    return total > 0 ? Math.round((this.hits / total) * 100) : 0;
  }
}

