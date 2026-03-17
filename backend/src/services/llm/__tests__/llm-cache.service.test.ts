/**
 * LLM Cache Service Tests
 * 
 * Unit tests for LLM caching functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LLMCacheService } from '../llm-cache.service.js';
import type { AttributeExtractionResult } from '../types.js';

describe('LLMCacheService', () => {
  let cache: LLMCacheService;
  let mockResult: AttributeExtractionResult;

  beforeEach(() => {
    cache = new LLMCacheService(60); // 60 second TTL for testing

    mockResult = {
      styleId: '12345',
      colorId: '01',
      qcPassed: true,
      productCategory: 'Apparel',
      department: 'Mens',
      category: 'Tops',
      subCategory: 'T-Shirts',
      brand: 'Nike',
      longStyleDesc: 'Black cotton t-shirt',
      shortStyleDesc: 'Black t-shirt',
      colorAiDesc: 'Black',
      additionalAttributes: { primary_color: 'Black' },
      confidence: 'High',
      processingTimeMs: 1500,
      rawResponse: '{}',
    };
  });

  describe('set and get', () => {
    it('should cache and retrieve result by image hash', () => {
      const imageBase64 = 'dGVzdGltYWdl';  // "testimage" in base64

      cache.set(imageBase64, mockResult);
      const cached = cache.get(imageBase64);

      expect(cached).toEqual(mockResult);
    });

    it('should return null for cache miss', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should handle different images independently', () => {
      const image1 = 'aW1hZ2Ux';  // "image1" in base64
      const image2 = 'aW1hZ2Uy';  // "image2" in base64
      
      const result1 = { ...mockResult, styleId: '11111' };
      const result2 = { ...mockResult, styleId: '22222' };

      cache.set(image1, result1);
      cache.set(image2, result2);

      expect(cache.get(image1)?.styleId).toBe('11111');
      expect(cache.get(image2)?.styleId).toBe('22222');
    });
  });

  describe('getStats', () => {
    it('should track cache hits and misses', () => {
      const image = 'dGVzdA==';

      // Miss
      cache.get(image);
      let stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0);

      // Set and hit
      cache.set(image, mockResult);
      cache.get(image);
      stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(50);

      // Another hit
      cache.get(image);
      stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(67); // 2/3 = 66.67% rounded to 67%
    });

    it('should track number of cached keys', () => {
      cache.set('image1', mockResult);
      cache.set('image2', mockResult);
      cache.set('image3', mockResult);

      const stats = cache.getStats();
      expect(stats.keys).toBe(3);
    });
  });

  describe('clear', () => {
    it('should clear all cached entries', () => {
      cache.set('image1', mockResult);
      cache.set('image2', mockResult);

      cache.clear();

      expect(cache.get('image1')).toBeNull();
      expect(cache.get('image2')).toBeNull();
      expect(cache.getStats().keys).toBe(0);
    });

    it('should reset hit/miss counters', () => {
      cache.set('image1', mockResult);
      cache.get('image1'); // Hit
      cache.get('image2'); // Miss

      cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('hash consistency', () => {
    it('should generate same hash for same image', () => {
      const image = 'dGVzdA==';

      cache.set(image, mockResult);
      const result1 = cache.get(image);
      const result2 = cache.get(image);

      expect(result1).toEqual(result2);
      expect(cache.getStats().hits).toBe(2);
    });

    it('should generate different hashes for different images', () => {
      const image1 = 'aW1hZ2Ux';
      const image2 = 'aW1hZ2Uy';

      cache.set(image1, { ...mockResult, styleId: '11111' });
      cache.set(image2, { ...mockResult, styleId: '22222' });

      expect(cache.get(image1)?.styleId).toBe('11111');
      expect(cache.get(image2)?.styleId).toBe('22222');
    });
  });
});

