import { Router, Response } from 'express';
import oracledb from 'oracledb';
import { tenantIsolation, type TenantRequest } from '../middleware/tenant-isolation.js';
import { withConnection } from '../services/oracle-pool.js';
import { asyncHandler } from '../middleware/oracle-error-handler.js';

const router = Router();

router.use(tenantIsolation);

/**
 * GET /api/export/seo/productgroup/:styleId
 * Generate schema.org JSON-LD for a style
 */
router.get('/seo/productgroup/:styleId', asyncHandler(async (req: TenantRequest, res: Response) => {
  const { business_unit_id } = req.query;
  const styleId = req.params.styleId as string;

  try {
    const jsonLd = await withConnection(async (conn) => {
      const result = await conn.execute(
        `SELECT ATTR_MGR.SEO_EXPORT_PKG.build_productgroup_jsonld(:tenant, :bu, :sid) as JSON_LD FROM DUAL`,
        {
          tenant: req.tenantId as string,
          bu: parseInt(business_unit_id as string, 10),
          sid: styleId
        }
      );
      const row = result.rows?.[0] as any;
      return row?.JSON_LD || row?.['BUILD_PRODUCTGROUP_JSONLD'];
    });

    if (!jsonLd) return res.status(404).json({ success: false, error: { message: 'Style not found' } });

    return res.json(JSON.parse(jsonLd));
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/export/seo/status/:styleId
 * Get SEO readiness status
 */
router.get('/seo/status/:styleId', asyncHandler(async (req: TenantRequest, res: Response) => {
  const { business_unit_id } = req.query;
  const styleId = req.params.styleId as string;

  try {
    const status = await withConnection(async (conn) => {
      const result = await conn.execute(
        `SELECT SEO_READY, MISSING_REASONS_JSON FROM ATTR_MGR.STYLE_SEO_STATUS
         WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :bu AND STYLE_ID = :sid`,
        {
          tenant: req.tenantId as string,
          bu: parseInt(business_unit_id as string, 10),
          sid: styleId
        }
      );
      const row = result.rows?.[0] as any;
      if (!row) return { seo_ready: 'N', missing_reasons: [] };
      
      return {
        seo_ready: row[0],
        missing_reasons: JSON.parse(row[1] || '[]')
      };
    });

    return res.json({ success: true, data: status });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

export default router;
