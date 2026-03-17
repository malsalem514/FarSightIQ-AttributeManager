/**
 * Products Service (Boring Vanilla)
 * 
 * Fetches products and hierarchy from local shadow caches (CATALOG_CACHE, HIERARCHY_CACHE)
 * Optimized for speed and DB Link stability.
 */

import oracledb from 'oracledb';
import { withConnection } from './oracle-pool.js';
import { logger } from '../utils/logger.js';
import { SettingsService } from './settings.service.js';
import type { ProductsQuery, Product, PaginatedResponse, HierarchyTree } from '../types/index.js';

export class ProductsService {
  /**
   * Get hierarchy data for cascading filters
   * Returns tree structure: Department → Classes → Subclasses
   */
  async getHierarchy(businessUnitId: number): Promise<HierarchyTree> {
    try {
      const settings = await SettingsService.getInstance();
      const tenantId = await settings.getActiveTenantId();

      // 1. Initial check: Is the cache populated for this BU/Tenant?
      const cacheCount = await withConnection(async (conn) => {
        const res = await conn.execute(
          `SELECT COUNT(*) as cnt FROM HIERARCHY_CACHE WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :bu_id`,
          { tenant: tenantId, bu_id: businessUnitId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        return (res.rows?.[0] as any)?.CNT || (res.rows?.[0] as any)?.[0] || 0;
      });

      // 2. If empty, trigger an on-demand sync for this BU/Tenant
      if (cacheCount === 0) {
        logger.info(`Hierarchy cache empty for BU ${businessUnitId} (Tenant: ${tenantId}). Triggering on-demand sync...`);
        await settings.triggerResync(businessUnitId);
      }

      // 3. Fetch from cache (now populated)
      const rows = await withConnection(async (conn) => {
        return await conn.execute(
          `SELECT DEPT_ID, DEPT_NAME, CLASS_ID, CLASS_DESCR, SUB_CLASS_ID, SUB_CLASS_DESCR
           FROM HIERARCHY_CACHE
           WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :bu_id
           ORDER BY DEPT_NAME, CLASS_DESCR, SUB_CLASS_DESCR`,
          { tenant: tenantId, bu_id: businessUnitId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
      });

      const deptMap = new Map<string, any>();

      for (const r of (rows.rows || []) as any[]) {
        if (!deptMap.has(r.DEPT_ID)) {
          deptMap.set(r.DEPT_ID, { id: r.DEPT_ID, name: r.DEPT_NAME?.trim() || r.DEPT_ID, classes: new Map() });
        }
        const dept = deptMap.get(r.DEPT_ID);

        if (!dept.classes.has(r.CLASS_ID)) {
          dept.classes.set(r.CLASS_ID, { id: r.CLASS_ID, name: r.CLASS_DESCR?.trim() || r.CLASS_ID, subclasses: new Map() });
        }
        const cls = dept.classes.get(r.CLASS_ID);

        if (!cls.subclasses.has(r.SUB_CLASS_ID)) {
          cls.subclasses.set(r.SUB_CLASS_ID, { id: r.SUB_CLASS_ID, name: r.SUB_CLASS_DESCR?.trim() || r.SUB_CLASS_ID });
        }
      }

      const departments: any[] = Array.from(deptMap.values()).map(d => ({
        id: d.id,
        name: d.name,
        classes: Array.from(d.classes.values()).map((c: any) => ({
          id: c.id,
          name: c.name,
          subclasses: Array.from(c.subclasses.values()) as any[]
        })) as any[]
      }));

          // Fetch Brands
          const brands = await withConnection(async (conn) => {
            const res = await conn.execute(
              `SELECT DISTINCT BRAND_NAME FROM CATALOG_CACHE_SHADOW WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :bu_id AND BRAND_NAME IS NOT NULL ORDER BY BRAND_NAME`,
              { tenant: tenantId, bu_id: businessUnitId },
              { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            return (res.rows as any[])?.map((b: any) => ({ id: b.BRAND_NAME, name: b.BRAND_NAME })) || [];
          });

          // Fetch Seasons, Vendors & Banners
      const { seasons, vendors, banners } = await withConnection(async (conn) => {
        const seasonRes = await conn.execute(
          `SELECT DISTINCT SEASON_ID FROM CATALOG_CACHE_SHADOW WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :bu_id AND SEASON_ID IS NOT NULL`,
          { tenant: tenantId, bu_id: businessUnitId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const vendorRes = await conn.execute(
          `SELECT DISTINCT VENDOR_ID FROM CATALOG_CACHE_SHADOW WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :bu_id AND VENDOR_ID IS NOT NULL`,
          { tenant: tenantId, bu_id: businessUnitId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        // Banners are stored in JSON array in CATALOG_CACHE_SHADOW
        // We need to parse them out to get a unique list for the filter
        const bannerRes = await conn.execute(
          `SELECT DISTINCT b.id, b.name
           FROM CATALOG_CACHE_SHADOW c,
                JSON_TABLE(c.BANNERS_JSON, '$[*]' COLUMNS (
                  id VARCHAR2(20) PATH '$.id',
                  name VARCHAR2(100) PATH '$.name'
                )) b
           WHERE c.TENANT_ID = :tenant AND c.BUSINESS_UNIT_ID = :bu_id AND c.BANNERS_JSON IS NOT NULL`,
          { tenant: tenantId, bu_id: businessUnitId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        return {
          seasons: seasonRes.rows?.map((r: any) => ({ id: r.SEASON_ID, name: r.SEASON_ID })) || [],
          vendors: vendorRes.rows?.map((r: any) => ({ id: r.VENDOR_ID, name: r.VENDOR_ID })) || [],
          banners: bannerRes.rows?.map((r: any) => ({ id: r.id, name: r.name })) || []
        };
      });

      return { departments: departments as any, brands, seasons, vendors, banners };
    } catch (error: any) {
      logger.error('Failed to fetch hierarchy from cache', { error: error.message });
      return { departments: [], brands: [], seasons: [], vendors: [], banners: [] };
    }
  }

  /** Alias for getHierarchy to support legacy routes */
  async getFilters(businessUnitId: number): Promise<HierarchyTree> {
    return this.getHierarchy(businessUnitId);
  }

  /**
   * Get products with unified authoring (Shadow Cache + Drafts)
   */
  async getProducts(query: ProductsQuery): Promise<PaginatedResponse<any>> {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();
    const buId = query.businessUnitId;
    const page = query.offset ? Math.floor(query.offset / (query.limit || 50)) + 1 : 1;
    const pageSize = query.limit || 50;
    const offset = (page - 1) * pageSize;

    return withConnection(async (conn) => {
      // 1. Determine Source Table
      const isDraftMode = query.mode === 'new';
      const sourceTable = isDraftMode ? 'STAGING_STYLES' : 'CATALOG_CACHE_SHADOW';
      
      // 2. Build Base Conditions
      const binds: any = { tenant: tenantId, buId };
      const conds = [`TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :buId`];

      if (query.departments?.length) {
        conds.push(`DEPARTMENT_ID IN (${query.departments.map((_, i) => `:d${i}`).join(',')})`);
        query.departments.forEach((d, i) => binds[`d${i}`] = d);
      }
      if (query.categories?.length) {
        conds.push(`CLASS_ID IN (${query.categories.map((_, i) => `:c${i}`).join(',')})`);
        query.categories.forEach((c, i) => binds[`c${i}`] = c);
      }
      if (query.subCategories?.length) {
        conds.push(`SUB_CLASS_ID IN (${query.subCategories.map((_, i) => `:sc${i}`).join(',')})`);
        query.subCategories.forEach((sc, i) => binds[`sc${i}`] = sc);
      }
      if (query.seasons?.length) {
        conds.push(`SEASON_ID IN (${query.seasons.map((_, i) => `:s${i}`).join(',')})`);
        query.seasons.forEach((s, i) => binds[`s${i}`] = s);
      }
      if (query.vendors?.length) {
        conds.push(`VENDOR_ID IN (${query.vendors.map((_, i) => `:v${i}`).join(',')})`);
        query.vendors.forEach((v, i) => binds[`v${i}`] = v);
      }
      if (!isDraftMode && query.banners?.length) {
        // Banners are stored in JSON array - check if any of the requested banner IDs exist in the JSON
        conds.push(`EXISTS (
          SELECT 1 FROM JSON_TABLE(BANNERS_JSON, '$[*]' COLUMNS (id VARCHAR2(20) PATH '$.id')) jt
          WHERE jt.id IN (${query.banners.map((_, i) => `:b${i}`).join(',')})
        )`);
        query.banners.forEach((b, i) => binds[`b${i}`] = b);
      }
      if (query.dateRange && query.dateRange !== 'all') {
        const days = parseInt(query.dateRange.replace('d', ''), 10);
        if (!isNaN(days)) {
          const dateCol = isDraftMode ? 'CREATED_AT' : 'SOURCE_DATE_CREATED';
          conds.push(`${dateCol} >= SYSTIMESTAMP - INTERVAL '${days}' DAY`);
        }
      }
          if (query.brands?.length && query.brands[0] !== '') {
            conds.push(`BRAND_NAME IN (${query.brands.map((_, i) => `:b${i}`).join(',')})`);
            query.brands.forEach((b, i) => binds[`b${i}`] = b);
          }
          if (query.search) {
        conds.push(`(STYLE_ID LIKE :search OR DESCRIPTION LIKE :search OR VENDOR_STYLE_NO LIKE :search)`);
        binds.search = `%${query.search}%`;
      }

      // 3. Status/Funnel Filters
      if (isDraftMode) {
        if (query.mode === 'new' && query.step === 'pending_promotion') {
          conds.push(`DRAFT_STATUS = 'READY'`);
        } else {
          conds.push(`DRAFT_STATUS IN ('DRAFT', 'READY')`);
        }
      } else {
        // Mode 'existing' (default) handles Funnel Stages
        if (query.hasImages === false) {
          conds.push(`HAS_IMAGE_IND = 'N'`);
        } else if (query.hasImages === true) {
          conds.push(`HAS_IMAGE_IND = 'Y'`);
        }
        
        // Step-specific filters
        if (query.step === 'ready_for_ai') {
          conds.push(`HAS_IMAGE_IND = 'Y' AND NOT EXISTS (SELECT 1 FROM AI_ATTRIBUTION_RESULTS ai WHERE ai.TENANT_ID = :tenant AND ai.BUSINESS_UNIT_ID = :buId AND ai.STYLE_ID = s.STYLE_ID)`);
        } else if (query.step === 'ai_review') {
          conds.push(`EXISTS (SELECT 1 FROM AI_ATTRIBUTION_RESULTS ai WHERE ai.TENANT_ID = :tenant AND ai.BUSINESS_UNIT_ID = :buId AND ai.STYLE_ID = s.STYLE_ID AND ai.STATUS = 'success')`);
        } else if (query.step === 'sync_ready') {
          conds.push(`EXISTS (SELECT 1 FROM AI_ATTRIBUTION_RESULTS ai WHERE ai.TENANT_ID = :tenant AND ai.BUSINESS_UNIT_ID = :buId AND ai.STYLE_ID = s.STYLE_ID AND ai.STATUS = 'accepted')`);
        }
      }

      const whereClause = conds.join(' AND ');

      // 4. Fetch Totals
      const totalRes = await conn.execute(
        `SELECT COUNT(*) as TOTAL FROM ${sourceTable} s WHERE ${whereClause}`,
        binds
      );
      const total = (totalRes.rows?.[0] as any)?.TOTAL || 0;

      // 5. Fetch Products
      const sortCol = isDraftMode ? 'CREATED_AT' : 'DATE_CREATED';
      const productsRes = await conn.execute(
        `SELECT * FROM ${sourceTable} s
         WHERE ${whereClause} 
         ORDER BY ${sortCol} DESC 
         OFFSET :off ROWS FETCH NEXT :lim ROWS ONLY`,
        { ...binds, off: offset, lim: pageSize },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const products = (productsRes.rows || []).map((r: any) => {
        let media = [];
        try {
          if (r.IMAGE_URLS_JSON) {
            media = typeof r.IMAGE_URLS_JSON === 'string' ? JSON.parse(r.IMAGE_URLS_JSON) : r.IMAGE_URLS_JSON;
          }
        } catch (e) {}

        const primary = media.find((m: any) => m.type === 'PRIMARY') || media[0];

        return {
          business_unit_id: buId,
          style_id: r.STYLE_ID || `DRAFT_${r.SESSION_ID}`,
          color_id: '000',
          style_name: r.SHORT_DESCRIPTION || r.DESCRIPTION || 'Untitled Style',
          dept_name: r.DEPT_NAME || 'Unknown Dept',
          class_name: r.CLASS_NAME || 'Unknown Class',
          subclass_name: r.SUB_CLASS_NAME || 'Unknown Subclass',
          brand_name: r.BRAND_NAME,
          vendor_id: r.VENDOR_ID,
          size_group_id: r.SIZE_GROUP_ID,
          status: isDraftMode ? r.DRAFT_STATUS.toLowerCase() : (r.AI_STATUS?.toLowerCase() || 'pending'),
          overall_confidence: isDraftMode ? (r.COMPLETION_PCT || 0) : 85,
          completion_pct: r.COMPLETION_PCT || 0,
          attribute_completeness: { filled: 3, total: 5 }, // Placeholder
          image_url: isDraftMode ? `/api/images/draft/${r.SESSION_ID}` : (primary?.url || null),
          media: isDraftMode ? [{ url: `/api/images/draft/${r.SESSION_ID}`, type: 'PRIMARY' }] : media,
          banners: r.BANNERS_JSON ? JSON.parse(r.BANNERS_JSON) : []
        };
      });

      return {
        success: true,
        total,
        limit: pageSize,
        offset,
        totalPages: Math.ceil(total / pageSize),
        data: products
      };
    });
  }
}

export const productsService = new ProductsService();
