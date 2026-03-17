/**
 * Mapping Engine Tests (TDD)
 *
 * Tests for semantic mapping from LLM output to ERP values
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock SemanticMappingService to prevent actual API calls
vi.mock('../attributes/semantic-mapping.service.js', () => {
  return {
    SemanticMappingService: class {
      findBestMatch() {
        return Promise.resolve(null);
      }
    }
  };
});

import { MappingEngine, MappedResult } from '../mapping-engine.js';
import type { MappingRule, CharValue } from '../../types/index.js';

describe('MappingEngine', () => {
  let engine: MappingEngine;

  const mockRules: MappingRule[] = [
    {
      mappingId: 1,
      businessUnitId: 1,
      llmInput: 'V Neck',
      targetTypeId: 'NCK01',
      targetValueId: 'VNK01',
      targetValueDesc: 'V-Neck',
      confidenceThreshold: 80,
      isActive: true,
      createdBy: 'test',
      createdDate: ''
    },
    {
      mappingId: 2,
      businessUnitId: 1,
      llmInput: '100% Cotton',
      targetTypeId: 'MAT01',
      targetValueId: 'COT01',
      targetValueDesc: 'Cotton',
      confidenceThreshold: 80,
      isActive: true,
      createdBy: 'test',
      createdDate: ''
    }
  ];

  const mockCharValues: CharValue[] = [
    { businessUnitId: 1, typeId: 'NCK01', valueId: 'VNK01', description: 'V-Neck' },
    { businessUnitId: 1, typeId: 'NCK01', valueId: 'RND01', description: 'Round Neck' },
    { businessUnitId: 1, typeId: 'NCK01', valueId: 'CRW01', description: 'Crew Neck' },
    { businessUnitId: 1, typeId: 'MAT01', valueId: 'COT01', description: 'Cotton' },
    { businessUnitId: 1, typeId: 'MAT01', valueId: 'PLY01', description: 'Polyester' },
    { businessUnitId: 1, typeId: 'MAT01', valueId: 'SLK01', description: 'Silk' }
  ];

  beforeEach(() => {
    engine = new MappingEngine(mockRules, mockCharValues);
  });

  // ==========================================================================
  // RULE-BASED MATCHING
  // ==========================================================================

  describe('matchByRule', () => {
    it('should return 100% confidence for exact rule match', async () => {
      const result = await engine.map('V Neck');

      expect(result).not.toBeNull();
      expect(result!.confidence).toBe(100);
      expect(result!.source).toBe('rule');
      expect(result!.typeId).toBe('NCK01');
      expect(result!.valueId).toBe('VNK01');
    });

    it('should be case-insensitive', async () => {
      const result = await engine.map('v neck');

      expect(result).not.toBeNull();
      expect(result!.confidence).toBe(100);
    });

    it('should trim whitespace', async () => {
      const result = await engine.map('  V Neck  ');

      expect(result).not.toBeNull();
      expect(result!.confidence).toBe(100);
    });

    it('should match "100% Cotton" rule', async () => {
      const result = await engine.map('100% Cotton');

      expect(result).not.toBeNull();
      expect(result!.typeId).toBe('MAT01');
      expect(result!.valueId).toBe('COT01');
    });
  });

  // ==========================================================================
  // FUZZY MATCHING
  // ==========================================================================

  describe('matchByFuzzy', () => {
    it('should match similar values with high confidence', async () => {
      // No exact rule for "V-Neck" (with hyphen) but should fuzzy match to "V-Neck" in char values
      const engineNoRules = new MappingEngine([], mockCharValues);
      const result = await engineNoRules.map('V-Neck');

      expect(result).not.toBeNull();
      expect(result!.source).toBe('fuzzy');
      expect(result!.confidence).toBeGreaterThanOrEqual(80);
      expect(result!.valueId).toBe('VNK01');
    });

    it('should match partial descriptions', async () => {
      const engineNoRules = new MappingEngine([], mockCharValues);
      const result = await engineNoRules.map('Cotton Blend');

      expect(result).not.toBeNull();
      expect(result!.valueId).toBe('COT01');
      expect(result!.confidence).toBeGreaterThanOrEqual(60);
    });

    it('should return null for no match', async () => {
      const result = await engine.map('XYZ123UnknownValue');

      expect(result).toBeNull();
    });

    it('should prefer higher confidence matches', async () => {
      const engineNoRules = new MappingEngine([], mockCharValues);
      // "Round Neck" should match "Round Neck" better than "Crew Neck"
      const result = await engineNoRules.map('Round Neck');

      expect(result).not.toBeNull();
      expect(result!.valueId).toBe('RND01');
    });
  });

  // ==========================================================================
  // BATCH MAPPING
  // ==========================================================================

  describe('mapAll', () => {
    it('should map all attributes from AI result', async () => {
      const aiAttributes = {
        neckline: 'V Neck',
        material: 'Polyester'
      };

      const results = await engine.mapAll(aiAttributes);

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('neckline');
      expect(results[0].aiValue).toBe('V Neck');
      expect(results[1].name).toBe('material');
    });

    it('should include unmapped attributes with null values', async () => {
      const aiAttributes = {
        neckline: 'V Neck',
        unknown_attr: 'SomeValue'
      };

      const results = await engine.mapAll(aiAttributes);

      expect(results).toHaveLength(2);
      const unknown = results.find(r => r.name === 'unknown_attr');
      expect(unknown).not.toBeUndefined();
      expect(unknown!.erpTypeId).toBeNull();
      expect(unknown!.mappingSource).toBe('none');
    });

    it('should return empty array for empty input', async () => {
      const results = await engine.mapAll({});

      expect(results).toEqual([]);
    });
  });

  // ==========================================================================
  // PRIORITY (RULE > FUZZY)
  // ==========================================================================

  describe('priority', () => {
    it('should prefer rule match over fuzzy match', async () => {
      // "V Neck" has both rule and could fuzzy match
      const result = await engine.map('V Neck');

      expect(result!.source).toBe('rule');
      expect(result!.confidence).toBe(100);
    });
  });

  // ==========================================================================
  // THRESHOLD
  // ==========================================================================

  describe('threshold', () => {
    it('should not return fuzzy matches below threshold', async () => {
      const engineNoRules = new MappingEngine([], mockCharValues);
      // "xyz" is too different from any value
      const result = await engineNoRules.map('xyz');

      expect(result).toBeNull();
    });
  });
});
