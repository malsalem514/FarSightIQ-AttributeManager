/**
 * Library Service Tests (TDD)
 * 
 * Tests for characteristic types, values, and mapping rules CRUD
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock Oracle pool
vi.mock('../oracle-pool.js', () => ({
  withConnection: vi.fn(),
  createPool: vi.fn(),
  closePool: vi.fn()
}));

import { withConnection } from '../oracle-pool.js';
import { LibraryService } from '../library.service.js';

/** Helper: Mock Oracle execute with rows */
function mockOracleExecute(rows: any[], rowsAffected = 0) {
  vi.mocked(withConnection).mockImplementation(async (fn) => {
    const mockConn = {
      execute: vi.fn().mockResolvedValue({
        rows,
        rowsAffected
      })
    };
    return fn(mockConn as any);
  });
}

/** Helper: Mock Oracle execute with error */
function mockOracleError(errorCode: string, message: string) {
  vi.mocked(withConnection).mockImplementation(async (fn) => {
    const mockConn = {
      execute: vi.fn().mockRejectedValue({
        errorNum: parseInt(errorCode.replace('ORA-', ''), 10),
        message: `${errorCode}: ${message}`
      })
    };
    return fn(mockConn as any);
  });
}

describe('LibraryService', () => {
  let service: LibraryService;

  beforeEach(() => {
    service = new LibraryService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // CHARACTERISTIC TYPES
  // ==========================================================================
  
  describe('getTypes', () => {
    it('should return all characteristic types for business unit', async () => {
      mockOracleExecute([
        { CHARACTERISTIC_TYPE_ID: 'MAT01', DESCRIPTION: 'Material', SUB_TYPE: 'STYL', VALUE_COUNT: 10 },
        { CHARACTERISTIC_TYPE_ID: 'NCK01', DESCRIPTION: 'Neckline', SUB_TYPE: 'STYL', VALUE_COUNT: 5 }
      ]);

      const types = await service.getTypes(1);

      expect(types).toHaveLength(2);
      expect(types[0]).toMatchObject({
        typeId: 'MAT01',
        description: 'Material',
        subType: 'STYL'
      });
    });

    it('should filter by subType when provided', async () => {
      mockOracleExecute([
        { CHARACTERISTIC_TYPE_ID: 'MAT01', SUB_TYPE: 'STYL' }
      ]);

      const types = await service.getTypes(1, 'STYL');

      expect(types).toHaveLength(1);
      expect(types[0].subType).toBe('STYL');
    });

    it('should return empty array when no types exist', async () => {
      mockOracleExecute([]);

      const types = await service.getTypes(1);

      expect(types).toEqual([]);
    });
  });

  describe('createType', () => {
    it('should create type and return it', async () => {
      mockOracleExecute([], 1);

      const result = await service.createType({
        businessUnitId: 1,
        typeId: 'NEW01',
        description: 'New Type',
        subType: 'STYL'
      });

      expect(result).toMatchObject({
        typeId: 'NEW01',
        description: 'New Type',
        subType: 'STYL'
      });
    });

    it('should uppercase typeId', async () => {
      mockOracleExecute([], 1);

      const result = await service.createType({
        businessUnitId: 1,
        typeId: 'new01',
        description: 'Test',
        subType: 'STYL'
      });

      expect(result.typeId).toBe('NEW01');
    });

    it('should throw on duplicate typeId', async () => {
      mockOracleError('ORA-00001', 'unique constraint violated');

      await expect(service.createType({
        businessUnitId: 1,
        typeId: 'MAT01',
        description: 'Duplicate',
        subType: 'STYL'
      })).rejects.toThrow(/already exists/i);
    });
  });

  describe('updateType', () => {
    it('should update type description', async () => {
      mockOracleExecute([], 1);

      const result = await service.updateType(1, 'MAT01', {
        description: 'Updated Material'
      });

      expect(result.description).toBe('Updated Material');
    });

    it('should throw if type not found', async () => {
      mockOracleExecute([], 0); // 0 rows affected

      await expect(service.updateType(1, 'NOTEXIST', {
        description: 'Test'
      })).rejects.toThrow(/not found/i);
    });
  });

  describe('deleteType', () => {
    it('should delete type successfully', async () => {
      mockOracleExecute([], 1);

      await expect(service.deleteType(1, 'MAT01')).resolves.not.toThrow();
    });

    it('should throw if type has values', async () => {
      mockOracleError('ORA-02292', 'integrity constraint violated - child record found');

      await expect(service.deleteType(1, 'MAT01'))
        .rejects.toThrow(/has associated values/i);
    });
  });

  // ==========================================================================
  // CHARACTERISTIC VALUES
  // ==========================================================================

  describe('getValues', () => {
    it('should return values for a type', async () => {
      mockOracleExecute([
        { CHARACTERISTIC_TYPE_ID: 'MAT01', CHARACTERISTIC_VALUE_ID: 'COT01', DESCRIPTION: 'Cotton' },
        { CHARACTERISTIC_TYPE_ID: 'MAT01', CHARACTERISTIC_VALUE_ID: 'PLY01', DESCRIPTION: 'Polyester' }
      ]);

      const values = await service.getValues(1, 'MAT01');

      expect(values).toHaveLength(2);
      expect(values[0]).toMatchObject({
        typeId: 'MAT01',
        valueId: 'COT01',
        description: 'Cotton'
      });
    });

    it('should return all values when typeId not specified', async () => {
      mockOracleExecute([
        { CHARACTERISTIC_TYPE_ID: 'MAT01', CHARACTERISTIC_VALUE_ID: 'COT01' },
        { CHARACTERISTIC_TYPE_ID: 'NCK01', CHARACTERISTIC_VALUE_ID: 'VNK01' }
      ]);

      const values = await service.getValues(1);

      expect(values).toHaveLength(2);
    });
  });

  describe('createValue', () => {
    it('should create value and return it', async () => {
      mockOracleExecute([], 1);

      const result = await service.createValue({
        businessUnitId: 1,
        typeId: 'MAT01',
        valueId: 'SLK01',
        description: 'Silk'
      });

      expect(result).toMatchObject({
        valueId: 'SLK01',
        description: 'Silk'
      });
    });

    it('should uppercase valueId', async () => {
      mockOracleExecute([], 1);

      const result = await service.createValue({
        businessUnitId: 1,
        typeId: 'MAT01',
        valueId: 'slk01',
        description: 'Silk'
      });

      expect(result.valueId).toBe('SLK01');
    });

    it('should throw if typeId does not exist', async () => {
      mockOracleError('ORA-02291', 'integrity constraint violated - parent key not found');

      await expect(service.createValue({
        businessUnitId: 1,
        typeId: 'NOTEXIST',
        valueId: 'VAL01',
        description: 'Test'
      })).rejects.toThrow(/does not exist/i);
    });
  });

  describe('deleteValue', () => {
    it('should delete value successfully', async () => {
      mockOracleExecute([], 1);

      await expect(service.deleteValue(1, 'MAT01', 'COT01')).resolves.not.toThrow();
    });

    it('should throw if value is in use', async () => {
      mockOracleError('ORA-02292', 'integrity constraint violated - child record found');

      await expect(service.deleteValue(1, 'MAT01', 'COT01'))
        .rejects.toThrow(/in use/i);
    });
  });

  // ==========================================================================
  // MAPPING RULES
  // ==========================================================================

  describe('getMappings', () => {
    it('should return all mapping rules', async () => {
      mockOracleExecute([
        { 
          MAPPING_ID: 1, 
          LLM_INPUT: 'V Neck', 
          TARGET_TYPE_ID: 'NCK01',
          TARGET_VALUE_ID: 'VNK01',
          CONFIDENCE_THRESHOLD: 80,
          IS_ACTIVE: 'Y'
        }
      ]);

      const rules = await service.getMappings(1);

      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({
        mappingId: 1,
        llmInput: 'V Neck',
        targetTypeId: 'NCK01',
        isActive: true
      });
    });
  });

  describe('createMapping', () => {
    it('should create mapping rule', async () => {
      mockOracleExecute([{ MAPPING_ID: 1 }], 1);

      const result = await service.createMapping({
        businessUnitId: 1,
        llmInput: 'Cotton',
        targetTypeId: 'MAT01',
        targetValueId: 'COT01'
      });

      expect(result.llmInput).toBe('Cotton');
      expect(result.targetTypeId).toBe('MAT01');
    });

    it('should throw on duplicate llmInput', async () => {
      mockOracleError('ORA-00001', 'unique constraint violated');

      await expect(service.createMapping({
        businessUnitId: 1,
        llmInput: 'V Neck',
        targetTypeId: 'NCK01',
        targetValueId: 'VNK01'
      })).rejects.toThrow(/already exists/i);
    });
  });

  describe('deleteMapping', () => {
    it('should delete mapping by ID', async () => {
      mockOracleExecute([], 1);

      await expect(service.deleteMapping(1)).resolves.not.toThrow();
    });

    it('should throw if mapping not found', async () => {
      mockOracleExecute([], 0);

      await expect(service.deleteMapping(999))
        .rejects.toThrow(/not found/i);
    });
  });

  // ==========================================================================
  // TEMPLATES
  // ==========================================================================

  describe('getTemplates', () => {
    it('should return templates with type count', async () => {
      mockOracleExecute([
        {
          TEMPLATE_ID: 1,
          TEMPLATE_NAME: 'Womens Dress',
          TARGET_CATEGORY: 'Dresses',
          IS_ACTIVE: 'Y',
          TYPE_COUNT: 5
        }
      ]);

      const templates = await service.getTemplates(1);

      expect(templates).toHaveLength(1);
      expect(templates[0]).toMatchObject({
        templateId: 1,
        templateName: 'Womens Dress',
        typeCount: 5
      });
    });
  });

  describe('createTemplate', () => {
    it('should create template with types', async () => {
      // First call returns template ID, subsequent calls insert types
      let callCount = 0;
      vi.mocked(withConnection).mockImplementation(async (fn) => {
        const mockConn = {
          execute: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return { rows: [{ TEMPLATE_ID: 1 }], rowsAffected: 1 };
            }
            return { rowsAffected: 1 };
          }),
          commit: vi.fn()
        };
        return fn(mockConn as any);
      });

      const result = await service.createTemplate({
        businessUnitId: 1,
        templateName: 'Test Template',
        targetCategory: 'Tops',
        typeIds: ['MAT01', 'NCK01']
      });

      expect(result.templateName).toBe('Test Template');
      expect(result.typeCount).toBe(2);
    });
  });

  describe('deleteTemplate', () => {
    it('should delete template and its types', async () => {
      mockOracleExecute([], 1);

      await expect(service.deleteTemplate(1)).resolves.not.toThrow();
    });
  });
});

