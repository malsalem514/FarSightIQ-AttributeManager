/**
 * Sync API Routes (Refactored)
 * 
 * Sync attributes to Oracle + validation
 * Pattern: Middleware + async handlers
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/oracle-error-handler.js';
import { validateBusinessUnitQuery, validateBusinessUnitBody, BusinessUnitRequest } from '../middleware/validate-business-unit.js';
import { sendSuccess, sendBadRequest } from '../utils/api-response.js';
import { syncService } from '../services/sync.service.js';
import { syncLimiter } from '../middleware/rate-limit.js';
import { insertIriStyleSync } from '../services/sync/sync-db.js';
import { withConnection } from '../services/oracle-pool.js';
import { logger } from '../utils/logger.js';
import oracledb from 'oracledb';
import { SettingsService } from '../services/settings.service.js';

const router = Router();

// Apply sync rate limiter to all routes
router.use(syncLimiter);

/**
 * POST /api/sync/upload-csv - Import styles via CSV (V008)
 * Body: { business_unit_id, csv: "style_id,description\n..." }
 */
router.post('/upload-csv', validateBusinessUnitBody, asyncHandler(async (req: BusinessUnitRequest, res) => {
  const { csv } = req.body;
  if (!csv) return sendBadRequest(res, 'CSV content required');

  const lines = csv.split('\n').filter((l: string) => l.trim());
  const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
  
  const styleIdIdx = headers.indexOf('style_id');
  const descIdx = headers.indexOf('description');

  if (styleIdIdx === -1) {
    return sendBadRequest(res, 'CSV must contain "style_id" column');
  }

  const jobId = Math.floor(Date.now() / 1000);
  let count = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c: string) => c.trim());
    if (cols.length < headers.length) continue;

    const styleId = cols[styleIdIdx];
    const description = descIdx !== -1 ? cols[descIdx] : `Imported ${styleId}`;

    await insertIriStyleSync({
      jobId,
      businessUnitId: req.businessUnitId!,
      styleId,
      description
    });
    count++;
  }

  // V011: Refresh Local Shadow Cache after upload
  await withConnection(async (conn) => {
    try {
      const settings = await SettingsService.getInstance();
      const tenantId = await settings.getActiveTenantId();
      await conn.execute(`BEGIN REFRESH_CATALOG_CACHE(:tenantId, :buId); END;`, { tenantId, buId: req.businessUnitId! });
      logger.info('[Sync] Shadow cache refreshed after CSV upload', { buId: req.businessUnitId!, tenantId });
    } catch (e: any) {
      logger.warn('[Sync] Shadow cache refresh failed (non-critical)', { error: e.message });
    }
  });

  res.json({ success: true, data: { count, jobId, message: 'Staged to IRI tables and cache refreshed' } });
}));

/**
 * POST /api/sync/style - Sync a single style
 */
router.post('/style', validateBusinessUnitBody, asyncHandler(async (req: BusinessUnitRequest, res) => {
  const { style_id, color_id, characteristics, long_style_desc, short_style_desc } = req.body;
  
  if (!style_id || !color_id) {
    return sendBadRequest(res, 'style_id and color_id are required');
  }

  const result = await syncService.syncStyle(req.businessUnitId!, {
    styleId: style_id,
    colorId: color_id,
    longStyleDesc: long_style_desc,
    shortStyleDesc: short_style_desc,
    characteristics: (characteristics || []).map((c: any) => ({
      typeId: c.type_id,
      valueId: c.value_id
    }))
  });
  
  const status = result.success ? 200 : 500;
  res.status(status).json({ success: result.success, data: result });
}));

/**
 * POST /api/sync/bulk - Sync multiple styles
 */
router.post('/bulk', validateBusinessUnitBody, asyncHandler(async (req: BusinessUnitRequest, res) => {
  const { styles } = req.body;
  
  if (!styles?.length) {
    return sendBadRequest(res, 'styles[] is required and cannot be empty');
  }

  const mappedStyles = styles.map((s: any) => ({
    styleId: s.style_id,
    colorId: s.color_id,
    longStyleDesc: s.long_style_desc,
    shortStyleDesc: s.short_style_desc,
    characteristics: (s.characteristics || []).map((c: any) => ({
      typeId: c.type_id,
      valueId: c.value_id
    }))
  }));

  const result = await syncService.syncBulk(req.businessUnitId!, mappedStyles);
  sendSuccess(res, result);
}));

/**
 * POST /api/sync/bulk-assign - Assign same characteristics to multiple styles
 */
router.post('/bulk-assign', validateBusinessUnitBody, asyncHandler(async (req: BusinessUnitRequest, res) => {
  const { style_ids, color_id, characteristics } = req.body;
  
  if (!style_ids?.length || !color_id || !characteristics?.length) {
    return sendBadRequest(res, 'style_ids[], color_id, and characteristics[] are required');
  }

  const result = await syncService.bulkAssign(req.businessUnitId!, {
    styleIds: style_ids,
    colorId: color_id,
    characteristics: characteristics.map((c: any) => ({
      typeId: c.type_id,
      valueId: c.value_id
    }))
  });

  sendSuccess(res, result);
}));

/**
 * POST /api/sync/diff - Preview changes before sync
 */
router.post('/diff', validateBusinessUnitBody, asyncHandler(async (req: BusinessUnitRequest, res) => {
  const { style_id, color_id, characteristics, long_style_desc, short_style_desc } = req.body;
  
  if (!style_id || !color_id) {
    return sendBadRequest(res, 'style_id and color_id are required');
  }

  const diff = await syncService.getDiff(req.businessUnitId!, {
    styleId: style_id,
    colorId: color_id,
    longStyleDesc: long_style_desc,
    shortStyleDesc: short_style_desc,
    characteristics: (characteristics || []).map((c: any) => ({
      typeId: c.type_id,
      valueId: c.value_id
    }))
  });

  sendSuccess(res, diff);
}));

/**
 * GET /api/sync/completeness - Check mandatory characteristics completeness
 */
router.get('/completeness', validateBusinessUnitQuery, asyncHandler(async (req: BusinessUnitRequest, res) => {
  const style_id = req.query.style_id as string;
  const color_id = req.query.color_id as string || '000';
  
  if (!style_id) {
    return sendBadRequest(res, 'style_id query parameter is required');
  }

  const completeness = await syncService.checkCompleteness(req.businessUnitId!, style_id, color_id);
  sendSuccess(res, completeness);
}));

/**
 * GET /api/sync/progress - Get real-time sync progress (Glass Box)
 */
router.get('/progress', asyncHandler(async (req, res) => {
  const buId = req.query.business_unit_id ? parseInt(req.query.business_unit_id as string, 10) : undefined;
  
  const settings = await SettingsService.getInstance();
  const tenantId = await settings.getActiveTenantId();

  const progress = await withConnection(async (conn) => {
    let sql = `SELECT TENANT_ID, BUSINESS_UNIT_ID, OP_NAME, STATUS, TOTAL_RECORDS, PROCESSED, 
                      ROUND((PROCESSED/NULLIF(TOTAL_RECORDS,0))*100, 2) as PROGRESS_PCT,
                      TO_CHAR(UPDATE_TIME, 'YYYY-MM-DD"T"HH24:MI:SS') as UPDATED,
                      ERROR_MSG, CURRENT_ITEM
               FROM ATTR_MGR.SYNC_PROGRESS
               WHERE TENANT_ID = :tenant`;
    const binds: any = { tenant: tenantId };
    
    if (buId) {
      sql += ` AND BUSINESS_UNIT_ID = :buId`;
      binds.buId = buId;
    }
    
    sql += ` ORDER BY UPDATE_TIME DESC`;

    const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return result.rows;
  });

  sendSuccess(res, progress);
}));

export default router;

