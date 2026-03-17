import { Router, Response } from 'express';
import { tenantIsolation, type TenantRequest } from '../middleware/tenant-isolation.js';
import { withConnection } from '../services/oracle-pool.js';
import { AppError } from '../utils/errors.js';
import { asyncHandler } from '../middleware/oracle-error-handler.js';

const router = Router();

router.use(tenantIsolation);

/**
 * GET /api/quality/runs
 * Get recent quality runs for a tenant
 */
router.get('/runs', asyncHandler(async (req: TenantRequest, res: Response) => {
  const tenantId = req.tenantId!;
  const businessUnitId = parseInt(req.query.business_unit_id as string, 10) || 1;

  try {
    const runs = await withConnection(async (conn) => {
      const result = await conn.execute(
        `SELECT RUN_ID, SCOPE, SCOPE_ID, STATUS, SUMMARY_JSON, CREATED_AT, CREATED_BY
         FROM ATTR_MGR.QUALITY_RUNS
         WHERE TENANT_ID = :tenant
         ORDER BY CREATED_AT DESC
         FETCH FIRST 50 ROWS ONLY`,
        { tenant: tenantId }
      );
      return result.rows || [];
    });

    return res.json({ success: true, data: runs });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/quality/runs/:runId/violations
 * Get violations for a specific run
 */
router.get('/runs/:runId/violations', asyncHandler(async (req: TenantRequest, res: Response) => {
  const runId = req.params.runId as string;

  try {
    const violations = await withConnection(async (conn) => {
      const result = await conn.execute(
        `SELECT VIOLATION_ID, STYLE_ID, TYPE_ID, SEVERITY, CODE, MESSAGE, SUGGESTION
         FROM ATTR_MGR.QUALITY_VIOLATIONS
         WHERE RUN_ID = :rid`,
        { rid: runId }
      );
      return result.rows || [];
    });

    return res.json({ success: true, data: violations });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

export default router;
