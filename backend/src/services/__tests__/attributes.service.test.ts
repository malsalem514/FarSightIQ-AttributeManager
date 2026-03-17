/**
 * Attributes Service Tests (TDD)
 *
 * Tests for AI attribute extraction and mapping
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock dependencies
vi.mock('axios');
vi.mock('../oracle-pool.js', () => ({
  withConnection: vi.fn(),
  createPool: vi.fn(),
  closePool: vi.fn()
}));

// Mock SettingsService
vi.mock('../settings.service.js', () => ({
  SettingsService: {
    getInstance: vi.fn().mockResolvedValue({
      getActiveTenantId: vi.fn().mockResolvedValue('TEST_TENANT')
    })
  }
}));

// Mock LLM config service
vi.mock('../llm-config.service.js', () => ({
  llmConfigService: {
    getActiveConfigInternal: vi.fn().mockResolvedValue(null),
    getBatchConfig: vi.fn().mockResolvedValue({ maxConcurrentRequests: 2 })
  }
}));

// Mock LLM provider factory
vi.mock('../llm/provider-factory.js', () => ({
  LLMProviderFactory: {
    create: vi.fn().mockReturnValue({
      name: 'mock',
      extractAttributes: vi.fn().mockResolvedValue({
        styleId: 'test',
        colorId: '000',
        confidence: '95',
        qcPassed: true,
        processingTimeMs: 100,
        additionalAttributes: {}
      }),
      healthCheck: vi.fn().mockResolvedValue(true)
    })
  }
}));

// Mock LLM cache service
vi.mock('../llm/llm-cache.service.js', () => ({
  LLMCacheService: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    getStats: vi.fn().mockReturnValue({ hits: 0, misses: 0, hitRate: 0, keys: 0 })
  }))
}));

// Mock batch progress service
vi.mock('../llm/batch-progress.service.js', () => ({
  batchProgressService: {
    createBatch: vi.fn().mockResolvedValue('batch-123'),
    updateProgress: vi.fn().mockResolvedValue(undefined),
    completeBatch: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock LLM service
vi.mock('../llm/LLMService.js', () => ({
  llmService: {
    logRun: vi.fn().mockResolvedValue(undefined),
    updateMappedAttributes: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock attributes-db
vi.mock('../attributes/attributes-db.js', () => ({
  getProductAttributes: vi.fn().mockResolvedValue([]),
  loadMappingRules: vi.fn().mockResolvedValue([]),
  loadCharValues: vi.fn().mockResolvedValue([]),
  saveAiResult: vi.fn().mockResolvedValue(undefined)
}));

// Mock attribute-definition service
vi.mock('../attributes/attribute-definition.service.js', () => ({
  AttributeDefinitionService: vi.fn().mockImplementation(() => ({
    getEffectiveRules: vi.fn().mockResolvedValue([])
  }))
}));

// Mock SemanticMappingService
vi.mock('../attributes/semantic-mapping.service.js', () => {
  return {
    SemanticMappingService: class {
      findBestMatch() {
        return Promise.resolve(null);
      }
    }
  };
});

// Mock config
vi.mock('../../config.js', () => ({
  config: {
    llm: {
      provider: 'openai',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4o-mini',
      cacheEnabled: false,
      cacheTtlSeconds: 3600
    },
    oracle: {
      user: 'test',
      password: 'test',
      connectString: 'test'
    }
  }
}));

import axios from 'axios';
import { withConnection } from '../oracle-pool.js';
import { AttributesService } from '../attributes.service.js';
import * as attributesDb from '../attributes/attributes-db.js';
import { LLMProviderFactory } from '../llm/provider-factory.js';

describe('AttributesService', () => {
  let service: AttributesService;

  beforeEach(() => {
    service = new AttributesService({ cacheEnabled: false });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractFromImage', () => {
    it('should download image and call LLM provider', async () => {
      // Mock axios.get for image download
      vi.mocked(axios.get).mockResolvedValue({
        data: Buffer.from('fake-image-data')
      });

      // Mock provider to return attributes
      const mockProvider = {
        name: 'mock',
        extractAttributes: vi.fn().mockResolvedValue({
          styleId: 'single',
          colorId: '000',
          confidence: '95',
          qcPassed: true,
          processingTimeMs: 100,
          additionalAttributes: { material: 'Cotton', neckline: 'V Neck' }
        }),
        healthCheck: vi.fn().mockResolvedValue(true)
      };
      vi.mocked(LLMProviderFactory.create).mockReturnValue(mockProvider as any);

      // Mock mapping rules that will match
      vi.mocked(attributesDb.loadMappingRules).mockResolvedValue([
        { mappingId: 1, businessUnitId: 1, llmInput: 'V Neck', targetTypeId: 'NCK01', targetValueId: 'VNK01', targetValueDesc: 'V-Neck', confidenceThreshold: 80, isActive: true, createdBy: 'test', createdDate: '' }
      ]);
      vi.mocked(attributesDb.loadCharValues).mockResolvedValue([
        { businessUnitId: 1, typeId: 'NCK01', valueId: 'VNK01', description: 'V-Neck' }
      ]);

      const result = await service.extractFromImage(1, 'https://example.com/image.jpg');

      expect(axios.get).toHaveBeenCalledWith(
        'https://example.com/image.jpg',
        expect.objectContaining({ responseType: 'arraybuffer' })
      );
      // Should return mapped attributes
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return mapped attributes with ERP values', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: Buffer.from('fake-image-data')
      });

      const mockProvider = {
        name: 'mock',
        extractAttributes: vi.fn().mockResolvedValue({
          styleId: 'single',
          colorId: '000',
          confidence: '95',
          qcPassed: true,
          processingTimeMs: 100,
          additionalAttributes: { neckline: 'V Neck' }
        }),
        healthCheck: vi.fn().mockResolvedValue(true)
      };
      vi.mocked(LLMProviderFactory.create).mockReturnValue(mockProvider as any);

      vi.mocked(attributesDb.loadMappingRules).mockResolvedValue([
        { mappingId: 1, businessUnitId: 1, llmInput: 'V Neck', targetTypeId: 'NCK01', targetValueId: 'VNK01', targetValueDesc: 'V-Neck', confidenceThreshold: 80, isActive: true, createdBy: 'test', createdDate: '' }
      ]);
      vi.mocked(attributesDb.loadCharValues).mockResolvedValue([
        { businessUnitId: 1, typeId: 'NCK01', valueId: 'VNK01', description: 'V-Neck' }
      ]);

      const result = await service.extractFromImage(1, 'https://example.com/image.jpg');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'neckline',
        aiValue: 'V Neck',
        erpTypeId: 'NCK01',
        erpValueId: 'VNK01',
        mappingSource: 'rule'
      });
    });

    it('should include unmapped attributes', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: Buffer.from('fake-image-data')
      });

      const mockProvider = {
        name: 'mock',
        extractAttributes: vi.fn().mockResolvedValue({
          styleId: 'single',
          colorId: '000',
          confidence: '95',
          qcPassed: true,
          processingTimeMs: 100,
          additionalAttributes: { unknown_attr: 'SomeValue' }
        }),
        healthCheck: vi.fn().mockResolvedValue(true)
      };
      vi.mocked(LLMProviderFactory.create).mockReturnValue(mockProvider as any);

      vi.mocked(attributesDb.loadMappingRules).mockResolvedValue([]);
      vi.mocked(attributesDb.loadCharValues).mockResolvedValue([]);

      const result = await service.extractFromImage(1, 'https://example.com/image.jpg');

      expect(result).toHaveLength(1);
      expect(result[0].erpTypeId).toBeNull();
      expect(result[0].mappingSource).toBe('none');
    });

    it('should throw on image download error', async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error('Connection refused'));

      await expect(service.extractFromImage(1, 'https://example.com/image.jpg'))
        .rejects.toThrow(/Connection refused/i);
    });
  });

  describe('extractFromBase64', () => {
    it('should send base64 image to LLM provider', async () => {
      const mockProvider = {
        name: 'mock',
        extractAttributes: vi.fn().mockResolvedValue({
          styleId: 'single',
          colorId: '000',
          confidence: '95',
          qcPassed: true,
          processingTimeMs: 100,
          additionalAttributes: { material: 'Silk' }
        }),
        healthCheck: vi.fn().mockResolvedValue(true)
      };
      vi.mocked(LLMProviderFactory.create).mockReturnValue(mockProvider as any);
      vi.mocked(attributesDb.loadMappingRules).mockResolvedValue([]);
      vi.mocked(attributesDb.loadCharValues).mockResolvedValue([]);

      await service.extractFromBase64(1, 'data:image/png;base64,iVBORw...');

      expect(mockProvider.extractAttributes).toHaveBeenCalledWith(
        expect.objectContaining({ imageBase64: 'data:image/png;base64,iVBORw...' })
      );
    });
  });

  describe('extractBatch', () => {
    it('should process multiple images', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: Buffer.from('fake-image-data')
      });

      const mockProvider = {
        name: 'mock',
        extractAttributes: vi.fn().mockResolvedValue({
          styleId: 'test',
          colorId: '000',
          confidence: '95',
          qcPassed: true,
          processingTimeMs: 100,
          additionalAttributes: { material: 'Cotton' }
        }),
        healthCheck: vi.fn().mockResolvedValue(true)
      };
      vi.mocked(LLMProviderFactory.create).mockReturnValue(mockProvider as any);
      vi.mocked(attributesDb.loadMappingRules).mockResolvedValue([]);
      vi.mocked(attributesDb.loadCharValues).mockResolvedValue([]);

      const images = [
        { styleId: '1001', colorId: '001', imageUrl: 'https://example.com/1.jpg' },
        { styleId: '1002', colorId: '001', imageUrl: 'https://example.com/2.jpg' }
      ];

      const results = await service.extractBatch(1, images);

      expect(results).toHaveLength(2);
      expect(mockProvider.extractAttributes).toHaveBeenCalledTimes(2);
    });

    it('should continue on individual image errors', async () => {
      // First image download fails, second succeeds
      vi.mocked(axios.get)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ data: Buffer.from('image-data') });

      const mockProvider = {
        name: 'mock',
        extractAttributes: vi.fn().mockResolvedValue({
          styleId: 'test',
          colorId: '000',
          confidence: '90',
          qcPassed: true,
          processingTimeMs: 100,
          additionalAttributes: { material: 'Cotton' }
        }),
        healthCheck: vi.fn().mockResolvedValue(true)
      };
      vi.mocked(LLMProviderFactory.create).mockReturnValue(mockProvider as any);
      vi.mocked(attributesDb.loadMappingRules).mockResolvedValue([]);
      vi.mocked(attributesDb.loadCharValues).mockResolvedValue([]);

      const images = [
        { styleId: '1001', colorId: '001', imageUrl: 'https://example.com/1.jpg' },
        { styleId: '1002', colorId: '001', imageUrl: 'https://example.com/2.jpg' }
      ];

      const results = await service.extractBatch(1, images);

      expect(results).toHaveLength(2);
      // Both should return results (first with empty base64 which may error in extraction)
    });
  });

  describe('getProductAttributes', () => {
    it('should fetch current style characteristics from Oracle', async () => {
      vi.mocked(attributesDb.getProductAttributes).mockResolvedValue([
        { typeId: 'MAT01', typeDescription: 'Material', valueId: 'COT01', description: 'Cotton' }
      ]);

      const result = await service.getProductAttributes(1, '1001', '001');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        typeId: 'MAT01',
        valueId: 'COT01',
        description: 'Cotton'
      });
    });
  });
});
