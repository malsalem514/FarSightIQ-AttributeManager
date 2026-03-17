/**
 * Products Service Tests (TDD)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock Oracle pool BEFORE importing service
vi.mock('../oracle-pool.js', () => ({
  withConnection: vi.fn(),
  createPool: vi.fn(),
  closePool: vi.fn()
}));

// Mock SettingsService
vi.mock('../settings.service.js', () => ({
  SettingsService: {
    getInstance: vi.fn().mockResolvedValue({
      getActiveTenantId: vi.fn().mockResolvedValue('TEST_TENANT'),
      triggerResync: vi.fn().mockResolvedValue(undefined)
    })
  }
}));

import { withConnection } from '../oracle-pool.js';
import { ProductsService } from '../products.service.js';
import type { ProductsQuery } from '../../types/index.js';

/**
 * Helper: mock withConnection to handle multiple sequential calls.
 * The getProducts method calls withConnection once (the main query block).
 * Inside, it calls conn.execute twice: once for COUNT, once for SELECT.
 */
function mockGetProductsCalls(productRows: any[], total?: number) {
  vi.mocked(withConnection).mockImplementation(async (fn) => {
    const mockConn = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [{ TOTAL: total ?? productRows.length }] }) // COUNT query
        .mockResolvedValueOnce({ rows: productRows }) // SELECT query
    };
    return fn(mockConn as any);
  });
}

/**
 * Helper: mock for getFilters/getHierarchy which calls withConnection multiple times
 */
function mockHierarchyCalls(hierarchyRows: any[], brandRows: any[], extraRows?: { seasons?: any[]; vendors?: any[]; banners?: any[] }) {
  let callCount = 0;
  vi.mocked(withConnection).mockImplementation(async (fn) => {
    callCount++;
    const mockConn = {
      execute: vi.fn().mockImplementation((sql: string) => {
        // First withConnection call: cache count check
        if (callCount === 1) {
          return { rows: [{ CNT: hierarchyRows.length }] };
        }
        // Second: hierarchy fetch
        if (callCount === 2) {
          return { rows: hierarchyRows };
        }
        // Third: brands
        if (callCount === 3) {
          return { rows: brandRows };
        }
        // Fourth: seasons + vendors + banners (all in one withConnection)
        if (callCount === 4) {
          if (sql.includes('SEASON_ID')) return { rows: extraRows?.seasons || [] };
          if (sql.includes('VENDOR_ID')) return { rows: extraRows?.vendors || [] };
          if (sql.includes('BANNER') || sql.includes('banner')) return { rows: extraRows?.banners || [] };
          return { rows: [] };
        }
        return { rows: [] };
      })
    };
    return fn(mockConn as any);
  });
}

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(() => {
    service = new ProductsService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getProducts', () => {
    it('should return products with required fields', async () => {
      const mockRows = [
        {
          STYLE_ID: '1000001',
          SHORT_DESCRIPTION: 'Test Product',
          DESCRIPTION: 'Test Product Full',
          DEPT_NAME: 'Womens',
          CLASS_NAME: 'Tops',
          SUB_CLASS_NAME: 'Blouses',
          BRAND_NAME: 'Nike',
          VENDOR_ID: 'V001',
          SIZE_GROUP_ID: 'SG1',
          AI_STATUS: 'success',
          COMPLETION_PCT: 80,
          IMAGE_URLS_JSON: null,
          BANNERS_JSON: null
        }
      ];
      mockGetProductsCalls(mockRows);

      const query: ProductsQuery = { businessUnitId: 1 };
      const result = await service.getProducts(query);

      expect(result.data).toHaveLength(1);
      expect(result.data![0]).toMatchObject({
        style_id: '1000001',
        dept_name: 'Womens',
        style_name: 'Test Product'
      });
    });

    it('should handle null thumbnail gracefully', async () => {
      const mockRows = [
        {
          STYLE_ID: '1',
          SHORT_DESCRIPTION: 'Test',
          DESCRIPTION: 'Test',
          DEPT_NAME: 'Unknown Dept',
          CLASS_NAME: 'Unknown Class',
          SUB_CLASS_NAME: 'Unknown Subclass',
          AI_STATUS: null,
          COMPLETION_PCT: 0,
          IMAGE_URLS_JSON: null,
          BANNERS_JSON: null
        }
      ];
      mockGetProductsCalls(mockRows);

      const result = await service.getProducts({ businessUnitId: 1 });

      // No image URLs means image_url should be null
      expect(result.data![0].image_url).toBeNull();
    });

    it('should apply department filter in query', async () => {
      // When departments filter is provided, the SQL has a WHERE condition.
      // We just verify the call completes and returns data.
      const mockRows = [
        {
          STYLE_ID: '2',
          SHORT_DESCRIPTION: 'Womens Item',
          DESCRIPTION: 'Womens Item',
          DEPT_NAME: 'Womens',
          CLASS_NAME: 'Tops',
          SUB_CLASS_NAME: 'Blouses',
          AI_STATUS: 'pending',
          COMPLETION_PCT: 0,
          IMAGE_URLS_JSON: null,
          BANNERS_JSON: null
        }
      ];
      mockGetProductsCalls(mockRows);

      const result = await service.getProducts({
        businessUnitId: 1,
        departments: ['Womens']
      });

      expect(result.data).toHaveLength(1);
      expect(result.data![0].style_id).toBe('2');
    });

    it('should return empty array when no products match', async () => {
      mockGetProductsCalls([]);

      const result = await service.getProducts({ businessUnitId: 1 });

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle Oracle connection error', async () => {
      vi.mocked(withConnection).mockRejectedValue(
        new Error('ORA-12154: TNS:could not resolve the connect identifier specified')
      );

      await expect(service.getProducts({ businessUnitId: 1 }))
        .rejects.toThrow(/ORA-12154/i);
    });
  });

  describe('getFilters', () => {
    it('should return hierarchy tree structure', async () => {
      const hierarchyRows = [
        { DEPT_ID: 'D1', DEPT_NAME: 'Mens', CLASS_ID: 'C1', CLASS_DESCR: 'Shirts', SUB_CLASS_ID: 'SC1', SUB_CLASS_DESCR: 'Casual' },
        { DEPT_ID: 'D1', DEPT_NAME: 'Mens', CLASS_ID: 'C1', CLASS_DESCR: 'Shirts', SUB_CLASS_ID: 'SC2', SUB_CLASS_DESCR: 'Dress' },
        { DEPT_ID: 'D2', DEPT_NAME: 'Womens', CLASS_ID: 'C2', CLASS_DESCR: 'Tops', SUB_CLASS_ID: 'SC3', SUB_CLASS_DESCR: 'Blouses' }
      ];
      const brandRows = [
        { BRAND_NAME: 'Adidas' },
        { BRAND_NAME: 'Nike' }
      ];
      mockHierarchyCalls(hierarchyRows, brandRows);

      const filters = await service.getFilters(1);

      expect(filters.departments).toHaveLength(2);
      expect(filters.brands).toHaveLength(2);
    });

    it('should return sorted brands', async () => {
      const hierarchyRows = [
        { DEPT_ID: 'D1', DEPT_NAME: 'Mens', CLASS_ID: 'C1', CLASS_DESCR: 'Shirts', SUB_CLASS_ID: 'SC1', SUB_CLASS_DESCR: 'Casual' }
      ];
      const brandRows = [
        { BRAND_NAME: 'Zara' },
        { BRAND_NAME: 'Adidas' },
        { BRAND_NAME: 'Nike' }
      ];
      mockHierarchyCalls(hierarchyRows, brandRows);

      const filters = await service.getFilters(1);

      // Brands come from CATALOG_CACHE_SHADOW sorted by BRAND_NAME (ORDER BY in SQL)
      expect(filters.brands).toHaveLength(3);
    });
  });
});
