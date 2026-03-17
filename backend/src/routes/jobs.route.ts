import { Router, Response } from 'express';
import { tenantIsolation, type TenantRequest } from '../middleware/tenant-isolation.js';
import { withConnection } from '../services/oracle-pool.js';
import oracledb from 'oracledb';
import { asyncHandler } from '../middleware/oracle-error-handler.js';

const router = Router();

router.use(tenantIsolation);

/**
 * GET /api/jobs
 * List background jobs
 */
router.get('/', asyncHandler(async (req: TenantRequest, res: Response) => {
  const { status, type, page = 1 } = req.query;
  const pageSize = 50;
  const offset = (Number(page) - 1) * pageSize;

  try {
    const jobs = await withConnection(async (conn) => {
      let sql = `SELECT JOB_ID, JOB_TYPE, STATUS, ATTEMPT_COUNT, MAX_ATTEMPTS, RUN_AFTER, LAST_ERROR_CODE, CREATED_AT 
                 FROM ATTR_MGR.JOB_QUEUE 
                 WHERE TENANT_ID = :tenant`;
      const binds: any = { tenant: req.tenantId };

      if (status) { sql += ` AND STATUS = :status`; binds.status = status; }
      if (type) { sql += ` AND JOB_TYPE = :type`; binds.type = type; }

      sql += ` ORDER BY CREATED_AT DESC OFFSET :off ROWS FETCH NEXT :limit ROWS ONLY`;
      binds.off = offset;
      binds.limit = pageSize;

      const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return result.rows;
    });

    return res.json({ success: true, data: jobs });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/jobs/:id/retry
 * Reset job status to QUEUED for retry
 */
router.post('/:id/retry', asyncHandler(async (req: TenantRequest, res: Response) => {
  try {
    await withConnection(async (conn) => {
      await conn.execute(
        `UPDATE ATTR_MGR.JOB_QUEUE SET STATUS = 'QUEUED', ATTEMPT_COUNT = 0, RUN_AFTER = CURRENT_TIMESTAMP 
         WHERE JOB_ID = :id AND TENANT_ID = :tenant`,
        { id: req.params.id as string, tenant: req.tenantId as string }
      );
      await conn.commit();
    });
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

export default router;
