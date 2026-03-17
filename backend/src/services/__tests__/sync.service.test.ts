/**
 * Sync Service Tests (TDD)
 *
 * Tests for syncing attributes to Oracle and validation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock Oracle
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

// Mock sync-db module
vi.mock('../sync/sync-db.js', () => ({
  insertDescriptionSync: vi.fn().mockResolvedValue(1),
  insertCharacteristicSync: vi.fn().mockResolvedValue(2),
  getCurrentStyle: vi.fn().mockResolvedValue({ DESCRIPTION: 'Old desc', NOTE_1: 'Old note' }),
  getCurrentCharacteristics: vi.fn().mockResolvedValue(new Map()),
  tableExists: vi.fn().mockResolvedValue(true),
  getProductType: vi.fn().mockResolvedValue({ PRODUCT_TYPE_ID: 100, PRODUCT_TYPE_NAME: 'Dresses' }),
  getMandatoryCharacteristics: vi.fn().mockResolvedValue([
    { typeId: 'MAT01', typeDesc: 'Material', isPresent: true, currentValueId: 'COT01', currentValueDesc: 'Cotton' },
    { typeId: 'NCK01', typeDesc: 'Neckline', isPresent: false, currentValueId: null, currentValueDesc: null }
  ])
}));

import { withConnection } from '../oracle-pool.js';
import { SyncService } from '../sync.service.js';
import * as syncDb from '../sync/sync-db.js';

/** Helper: Set up withConnection mock that doesn't throw */
function mockWithConnection() {
  vi.mocked(withConnection).mockImplementation(async (fn) => {
    const mockConn = {
      execute: vi.fn().mockResolvedValue({ rowsAffected: 1 }),
      commit: vi.fn()
    };
    return fn(mockConn as any);
  });
}

describe('SyncService', () => {
  let service: SyncService;

  beforeEach(() => {
    service = new SyncService();
    vi.clearAllMocks();
    // Default: withConnection works for the SYNC_PROGRESS writes
    mockWithConnection();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // SYNC SINGLE STYLE
  // ==========================================================================

  describe('syncStyle', () => {
    it('should insert style characteristics', async () => {
      await service.syncStyle(1, {
        styleId: '1001',
        colorId: '001',
        characteristics: [
          { typeId: 'MAT01', valueId: 'COT01' },
          { typeId: 'NCK01', valueId: 'VNK01' }
        ]
      });

      // Should have called insertCharacteristicSync for each characteristic
      expect(syncDb.insertCharacteristicSync).toHaveBeenCalledTimes(2);
    });

    it('should insert description sync when descriptions provided', async () => {
      await service.syncStyle(1, {
        styleId: '1001',
        colorId: '001',
        longStyleDesc: 'New long description',
        shortStyleDesc: 'Short desc',
        characteristics: []
      });

      // Should have called insertDescriptionSync
      expect(syncDb.insertDescriptionSync).toHaveBeenCalledTimes(1);
      expect(syncDb.insertDescriptionSync).toHaveBeenCalledWith(
        expect.objectContaining({
          styleId: '1001',
          longDesc: 'New long description',
          shortDesc: 'Short desc'
        })
      );
    });

    it('should use MERGE/upsert pattern via syncDb', async () => {
      await service.syncStyle(1, {
        styleId: '1001',
        colorId: '001',
        characteristics: [{ typeId: 'MAT01', valueId: 'COT01' }]
      });

      // The sync-db module handles MERGE/INSERT internally
      expect(syncDb.insertCharacteristicSync).toHaveBeenCalledWith(
        expect.objectContaining({
          styleId: '1001',
          typeId: 'MAT01',
          valueId: 'COT01'
        })
      );
    });

    it('should return sync result', async () => {
      const result = await service.syncStyle(1, {
        styleId: '1001',
        colorId: '001',
        characteristics: [{ typeId: 'MAT01', valueId: 'COT01' }]
      });

      expect(result).toMatchObject({
        styleId: '1001',
        success: true,
        synced: 1
      });
    });
  });

  // ==========================================================================
  // BULK SYNC
  // ==========================================================================

  describe('syncBulk', () => {
    it('should process multiple styles', async () => {
      const result = await service.syncBulk(1, [
        { styleId: '1001', colorId: '001', characteristics: [{ typeId: 'MAT01', valueId: 'COT01' }] },
        { styleId: '1002', colorId: '001', characteristics: [{ typeId: 'NCK01', valueId: 'VNK01' }] }
      ]);

      expect(result.synced).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should continue on individual errors and track failures', async () => {
      // Make the first syncStyle call fail by having insertCharacteristicSync throw
      let callCount = 0;
      vi.mocked(syncDb.insertCharacteristicSync).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First sync failed');
        }
        return 2;
      });

      const result = await service.syncBulk(1, [
        { styleId: '1001', colorId: '001', characteristics: [{ typeId: 'MAT01', valueId: 'COT01' }] },
        { styleId: '1002', colorId: '001', characteristics: [{ typeId: 'NCK01', valueId: 'VNK01' }] }
      ]);

      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].styleId).toBe('1001');
    });
  });

  // ==========================================================================
  // COMPLETENESS CHECK
  // ==========================================================================

  describe('checkCompleteness', () => {
    it('should return mandatory characteristics status', async () => {
      const result = await service.checkCompleteness(1, '1001', '001');

      expect(result.mandatoryChars).toHaveLength(2);
      expect(result.mandatoryChars[0]).toMatchObject({
        typeId: 'MAT01',
        isPresent: true
      });
      expect(result.mandatoryChars[1]).toMatchObject({
        typeId: 'NCK01',
        isPresent: false
      });
    });

    it('should calculate completeness percentage', async () => {
      const result = await service.checkCompleteness(1, '1001', '001');

      // 1 of 2 mandatory present = 50%
      expect(result.completenessPct).toBe(50);
    });

    it('should indicate if sync-ready', async () => {
      const result = await service.checkCompleteness(1, '1001', '001');

      // Missing 1 mandatory = not ready
      expect(result.isSyncReady).toBe(false);
    });

    it('should return 100% when all mandatory present', async () => {
      vi.mocked(syncDb.getMandatoryCharacteristics).mockResolvedValue([
        { typeId: 'MAT01', typeDesc: 'Material', isPresent: true, currentValueId: 'COT01', currentValueDesc: 'Cotton' }
      ]);

      const result = await service.checkCompleteness(1, '1001', '001');

      expect(result.completenessPct).toBe(100);
      expect(result.isSyncReady).toBe(true);
    });
  });

  // ==========================================================================
  // BULK ASSIGN
  // ==========================================================================

  describe('bulkAssign', () => {
    it('should assign same values to multiple styles', async () => {
      await service.bulkAssign(1, {
        styleIds: ['1001', '1002', '1003'],
        colorId: '001',
        characteristics: [{ typeId: 'MAT01', valueId: 'COT01' }]
      });

      // Should process all 3 styles (each gets 1 characteristic)
      expect(syncDb.insertCharacteristicSync).toHaveBeenCalledTimes(3);
    });
  });
});
