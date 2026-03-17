import { Router, Response } from 'express';
import { tenantIsolation, type TenantRequest } from '../middleware/tenant-isolation.js';
import { withConnection } from '../services/oracle-pool.js';
import oracledb from 'oracledb';
import { asyncHandler } from '../middleware/oracle-error-handler.js';

const router = Router();

// Taxonomy routes require tenant isolation
router.use(tenantIsolation);

/**
 * GET /api/taxonomy/categories/search
 * Search taxonomy categories
 */
router.get('/categories/search', asyncHandler(async (req: TenantRequest, res: Response) => {
  const { q, version_tag = 'v1' } = req.query;
  
  try {
    const categories = await withConnection(async (conn) => {
      const result = await conn.execute(
        `BEGIN ATTR_MGR.TAXONOMY_PKG.search_categories(:ver, :q, 20, :rc); END;`,
        {
          ver: version_tag as string,
          q: (q as string) || '',
          rc: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
        }
      );
      
      const resultSet = (result.outBinds as any).rc;
      const rows = [];
      let row;
      while ((row = await resultSet.getRow())) {
        rows.push({ id: row.CATEGORY_ID, name: row.NAME, path: row.PATH });
      }
      await resultSet.close();
      return rows;
    });

    return res.json({ success: true, data: categories });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/taxonomy/roots
 * Get top-level vertical categories
 */
router.get('/roots', asyncHandler(async (req: TenantRequest, res: Response) => {
  const { version_tag = 'v1' } = req.query;
  try {
    const roots = await withConnection(async (conn) => {
      const result = await conn.execute(
        `BEGIN ATTR_MGR.TAXONOMY_PKG.get_root_categories(:ver, :rc); END;`,
        { ver: version_tag as string, rc: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR } }
      );
      const resultSet = (result.outBinds as any).rc;
      const rows = [];
      let row;
      while ((row = await resultSet.getRow())) {
        rows.push({ id: row.CATEGORY_ID, name: row.NAME, path: row.PATH, child_count: row.CHILD_COUNT });
      }
      await resultSet.close();
      return rows;
    });
    return res.json({ success: true, data: roots });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/taxonomy/children/:parentId
 * Get child categories for a parent
 */
router.get('/children/:parentId', asyncHandler(async (req: TenantRequest, res: Response) => {
  const { version_tag = 'v1' } = req.query;
  const parentId = req.params.parentId as string;
  try {
    const children = await withConnection(async (conn) => {
      const result = await conn.execute(
        `BEGIN ATTR_MGR.TAXONOMY_PKG.get_child_categories(:ver, :parent, :rc); END;`,
        { ver: version_tag as string, parent: parentId, rc: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR } }
      );
      const resultSet = (result.outBinds as any).rc;
      const rows = [];
      let row;
      while ((row = await resultSet.getRow())) {
        rows.push({ id: row.CATEGORY_ID, name: row.NAME, path: row.PATH, child_count: row.CHILD_COUNT });
      }
      await resultSet.close();
      return rows;
    });
    return res.json({ success: true, data: children });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/taxonomy/attributes/:categoryId
 * Get attributes associated with a category
 */
router.get('/attributes/:categoryId', asyncHandler(async (req: TenantRequest, res: Response) => {
  const { version_tag = 'v1' } = req.query;
  const categoryId = req.params.categoryId as string;
  try {
    const attrs = await withConnection(async (conn) => {
      const result = await conn.execute(
        `BEGIN ATTR_MGR.TAXONOMY_PKG.get_category_attributes(:ver, :cat, :rc); END;`,
        { ver: version_tag as string, cat: categoryId, rc: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR } }
      );
      const resultSet = (result.outBinds as any).rc;
      const rows = [];
      let row;
      while ((row = await resultSet.getRow())) {
        rows.push({ 
          code: row.ATTR_CODE, 
          name: row.NAME, 
          type: row.VALUE_TYPE, 
          description: row.DESCRIPTION, 
          mandatory: row.REQUIRED_HINT === 'Y' 
        });
      }
      await resultSet.close();
      return rows;
    });
    return res.json({ success: true, data: attrs });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/taxonomy/stats
 * Get taxonomy overview statistics
 */
router.get('/stats', asyncHandler(async (req: TenantRequest, res: Response) => {
  const { version_tag = 'v1' } = req.query;
  try {
    const stats = await withConnection(async (conn) => {
      const result = await conn.execute(
        `BEGIN ATTR_MGR.TAXONOMY_PKG.get_taxonomy_stats(:ver, :cats, :attrs, :assocs); END;`,
        { 
          ver: version_tag as string, 
          cats: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          attrs: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          assocs: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );
      const outBinds = result.outBinds as any;
      return {
        categories: outBinds.cats,
        attributes: outBinds.attrs,
        associations: outBinds.assocs
      };
    });
    return res.json({ success: true, data: stats });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/taxonomy/mappings
 * Upsert tenant hierarchy mapping
 */
router.post('/mappings', asyncHandler(async (req: TenantRequest, res: Response) => {
  const { business_unit_id, dept_id, class_id, subclass_id, version_tag, ext_category_id } = req.body;

  try {
    await withConnection(async (conn) => {
      await conn.execute(
        `BEGIN ATTR_MGR.TAXONOMY_PKG.upsert_tenant_mapping(:tenant, :bu, :dept, :class, :sub, :ver, :ext, 100, 'manual', :user); END;`,
        {
          tenant: req.tenantId,
          bu: business_unit_id,
          dept: dept_id || null,
          class: class_id || null,
          sub: subclass_id || null,
          ver: version_tag,
          ext: ext_category_id,
          user: 'admin'
        }
      );
      await conn.commit();
    });

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/taxonomy/import
 * Import taxonomy from JSON
 */
router.post('/import', asyncHandler(async (req: TenantRequest, res: Response) => {
  const { version_tag, source, json_data, checksum } = req.body;

  try {
    await withConnection(async (conn) => {
      await conn.execute(
        `BEGIN ATTR_MGR.TAXONOMY_PKG.import_taxonomy(:ver, :src, :json, :chk, 'N'); END;`,
        {
          ver: version_tag,
          src: source,
          json: JSON.stringify(json_data),
          chk: checksum || 'manual'
        }
      );
      await conn.commit();
    });

    return res.json({ success: true, message: 'Taxonomy imported successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/taxonomy/seed-templates
 * Seed characteristic templates from taxonomy mapping
 */
router.post('/seed-templates', asyncHandler(async (req: TenantRequest, res: Response) => {
  const { business_unit_id, dept_id, class_id, subclass_id, seed_mode = 'advisory' } = req.body;

  if (!business_unit_id || !dept_id) {
    return res.status(400).json({ 
      success: false, 
      error: { message: 'business_unit_id and dept_id are required' } 
    });
  }

  try {
    await withConnection(async (conn) => {
      await conn.execute(
        `BEGIN ATTR_MGR.TAXONOMY_PKG.seed_templates_from_mapping(:tenant, :bu, :dept, :class, :sub, :mode, :user); END;`,
        {
          tenant: req.tenantId,
          bu: business_unit_id,
          dept: dept_id,
          class: class_id || null,
          sub: subclass_id || null,
          mode: seed_mode,
          user: 'admin'
        }
      );
      await conn.commit();
    });

    return res.json({ success: true, message: 'Templates seeded successfully' });
  } catch (error: any) {
    // Graceful handling for missing mapping
    if (error.message?.includes('No taxonomy mapping found')) {
      return res.status(404).json({ 
        success: false, 
        error: { message: 'No taxonomy mapping found for this hierarchy. Please map to a category first.' } 
      });
    }
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/taxonomy/apply-template
 * Apply a template to hierarchy rules
 */
router.post('/apply-template', asyncHandler(async (req: TenantRequest, res: Response) => {
  const { business_unit_id, level_type, level_id, template_id } = req.body;

  if (!business_unit_id || !level_type || !level_id || !template_id) {
    return res.status(400).json({ 
      success: false, 
      error: { message: 'business_unit_id, level_type, level_id, and template_id are required' } 
    });
  }

  try {
    await withConnection(async (conn) => {
      await conn.execute(
        `BEGIN ATTR_MGR.TAXONOMY_PKG.apply_template_to_hierarchy(:tenant, :bu, :lt, :lid, :tid, :user); END;`,
        {
          tenant: req.tenantId,
          bu: business_unit_id,
          lt: level_type,
          lid: level_id,
          tid: template_id,
          user: 'admin'
        }
      );
      await conn.commit();
    });

    return res.json({ success: true, message: 'Template applied to hierarchy' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

export default router;
