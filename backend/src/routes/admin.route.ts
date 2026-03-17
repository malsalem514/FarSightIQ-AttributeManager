/**
 * Admin API Routes
 * 
 * Comprehensive monitoring and debugging endpoints for enterprise admins.
 * Provides visibility into AI operations, batch processing, and system health.
 */

import { Router, Request, Response } from 'express';
import { withConnection } from '../services/oracle-pool.js';
import { SettingsService } from '../services/settings.service.js';
import { batchProgressService } from '../services/llm/batch-progress.service.js';
import { enrichedContextService } from '../services/llm/enriched-context.service.js';
import { buildUserPrompt as buildUserPromptV2, buildSystemPrompt as buildSystemPromptV2 } from '../prompts/attribute-extraction-v2.js';
import { logger } from '../utils/logger.js';
import oracledb from 'oracledb';
import { asyncHandler } from '../middleware/oracle-error-handler.js';

const router = Router();

/**
 * GET /api/admin/debug/prompt-preview/:styleId
 * Preview what prompt would be sent for a specific style
 * This helps diagnose if style-specific context is being built properly
 */
router.get('/debug/prompt-preview/:styleId', asyncHandler(async (req: Request, res: Response) => {
  try {
    const styleId = req.params.styleId as string;
    const buId = parseInt(req.query.business_unit_id as string) || 1;
    
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();
    
    // Build full context (same as actual enrichment)
    const fullContext = await enrichedContextService.buildFullContext(buId, styleId, '000');
    
    // Build prompts
    const systemPrompt = buildSystemPromptV2(tenantId);
    const userPrompt = buildUserPromptV2(fullContext);
    
    res.json({
      success: true,
      tenantId,
      businessUnitId: buId,
      styleId,
      contextSummary: {
        hasProduct: !!fullContext.product.description,
        productDescription: fullContext.product.description?.substring(0, 100),
        brand: fullContext.product.brandName,
        vendor: fullContext.product.vendorName,
        hierarchy: fullContext.hierarchy,
        existingAttributeCount: fullContext.existingAttributes.length,
        existingAttributes: fullContext.existingAttributes.slice(0, 5).map(a => `${a.typeName}: ${a.valueName}`),
        mandatoryRulesCount: fullContext.mandatoryRules.length,
        mandatoryRules: fullContext.mandatoryRules.map(r => r.attributeName),
        optionalRulesCount: fullContext.optionalRules.length,
        optionalRules: fullContext.optionalRules.map(r => r.attributeName),
        validValuesCount: Object.keys(fullContext.validValues || {}).length,
        validValuesKeys: Object.keys(fullContext.validValues || {}).slice(0, 10)
      },
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      userPromptPreview: userPrompt.substring(0, 3000) + (userPrompt.length > 3000 ? '...' : ''),
      fullUserPrompt: userPrompt  // Full prompt for detailed inspection
    });
  } catch (error: any) {
    logger.error('Debug prompt preview failed', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

/**
 * GET /api/admin/ai-runs
 * List AI model runs with filtering and pagination
 */
router.get('/ai-runs', asyncHandler(async (req: Request, res: Response) => {
  try {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();
    
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.page_size as string) || 50, 100);
    const offset = (page - 1) * pageSize;
    
    const status = req.query.status as string;
    const provider = req.query.provider as string;
    const dateFrom = req.query.date_from as string;
    const dateTo = req.query.date_to as string;
    const styleId = req.query.style_id as string;
    const batchId = req.query.batch_id as string;
    
    const result = await withConnection(async (conn) => {
      // Build dynamic WHERE clause
      let whereClause = 'WHERE r.TENANT_ID = :tenantId';
      const binds: any = { tenantId };
      
      if (status) {
        whereClause += ' AND r.STATUS = :status';
        binds.status = status;
      }
      if (provider) {
        whereClause += ' AND r.PROVIDER = :provider';
        binds.provider = provider;
      }
      if (dateFrom) {
        whereClause += ' AND r.CREATED_AT >= TO_TIMESTAMP(:dateFrom, \'YYYY-MM-DD\')';
        binds.dateFrom = dateFrom;
      }
      if (dateTo) {
        whereClause += ' AND r.CREATED_AT <= TO_TIMESTAMP(:dateTo, \'YYYY-MM-DD\') + 1';
        binds.dateTo = dateTo;
      }
      if (styleId) {
        whereClause += ' AND r.STYLE_ID LIKE :styleId';
        binds.styleId = `%${styleId}%`;
      }
      if (batchId) {
        whereClause += ' AND r.BATCH_ID = :batchId';
        binds.batchId = batchId;
      }
      
      // Count total
      const countResult = await conn.execute(
        `SELECT COUNT(*) as total FROM ATTR_MGR.AI_MODEL_RUNS r ${whereClause}`,
        binds
      );
      const total = (countResult.rows as any[])?.[0]?.[0] || 0;
      
      // Get paginated results
      const dataResult = await conn.execute(
        `SELECT r.RUN_ID, r.TENANT_ID, r.BUSINESS_UNIT_ID, r.STYLE_ID, r.COLOR_ID,
                r.PROVIDER, r.MODEL, r.STATUS, r.CONFIDENCE,
                r.COST_USD, r.TOKENS_INPUT, r.TOKENS_OUTPUT,
                r.BATCH_ID, r.LATENCY_MS, r.ERROR_CODE,
                r.CREATED_AT,
                CASE WHEN r.PROMPT_TEXT IS NOT NULL THEN 'Y' ELSE 'N' END as HAS_PROMPT,
                CASE WHEN r.CONTEXT_JSON IS NOT NULL THEN 'Y' ELSE 'N' END as HAS_CONTEXT,
                CASE WHEN r.MAPPED_ATTRIBUTES_JSON IS NOT NULL THEN 'Y' ELSE 'N' END as HAS_MAPPING
         FROM ATTR_MGR.AI_MODEL_RUNS r
         ${whereClause}
         ORDER BY r.CREATED_AT DESC
         OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
        { ...binds, offset, pageSize },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      return {
        runs: dataResult.rows || [],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    });
    
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Failed to fetch AI runs', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/admin/ai-runs/:runId
 * Get detailed run info including prompt, context, and response
 */
router.get('/ai-runs/:runId', asyncHandler(async (req: Request, res: Response) => {
  try {
    const runId = parseInt(req.params.runId as string);
    
    const result = await withConnection(async (conn) => {
      const dataResult = await conn.execute(
        `SELECT r.RUN_ID, r.TENANT_ID, r.BUSINESS_UNIT_ID, r.STYLE_ID, r.COLOR_ID,
                r.PROVIDER, r.MODEL, r.STATUS, r.CONFIDENCE,
                r.COST_USD, r.TOKENS_INPUT, r.TOKENS_OUTPUT,
                r.BATCH_ID, r.LATENCY_MS, r.ERROR_CODE,
                r.CREATED_AT,
                r.PROMPT_TEXT, r.CONTEXT_JSON, r.MAPPED_ATTRIBUTES_JSON,
                ai.SHORT_STYLE_DESC, ai.LONG_STYLE_DESC, ai.ADDITIONAL_ATTRIBUTES
         FROM ATTR_MGR.AI_MODEL_RUNS r
         LEFT JOIN ATTR_MGR.AI_ATTRIBUTION_RESULTS ai 
           ON r.TENANT_ID = ai.TENANT_ID 
           AND r.BUSINESS_UNIT_ID = ai.BUSINESS_UNIT_ID 
           AND r.STYLE_ID = ai.STYLE_ID 
           AND r.COLOR_ID = ai.COLOR_ID
         WHERE r.RUN_ID = :runId`,
        { runId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { PROMPT_TEXT: { type: oracledb.STRING }, CONTEXT_JSON: { type: oracledb.STRING }, MAPPED_ATTRIBUTES_JSON: { type: oracledb.STRING }, ADDITIONAL_ATTRIBUTES: { type: oracledb.STRING } } }
      );
      
      if (!dataResult.rows?.length) return null;
      
      const row = dataResult.rows[0] as any;
      
      // Parse JSON fields
      let contextJson = null;
      let mappedAttributes = null;
      let additionalAttributes = null;
      
      try { if (row.CONTEXT_JSON) contextJson = JSON.parse(row.CONTEXT_JSON); } catch {}
      try { if (row.MAPPED_ATTRIBUTES_JSON) mappedAttributes = JSON.parse(row.MAPPED_ATTRIBUTES_JSON); } catch {}
      try { if (row.ADDITIONAL_ATTRIBUTES) additionalAttributes = JSON.parse(row.ADDITIONAL_ATTRIBUTES); } catch {}
      
      return {
        ...row,
        CONTEXT_JSON: contextJson,
        MAPPED_ATTRIBUTES_JSON: mappedAttributes,
        ADDITIONAL_ATTRIBUTES: additionalAttributes
      };
    });
    
    if (!result) {
      return res.status(404).json({ success: false, error: { message: 'Run not found' } });
    }
    
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Failed to fetch AI run details', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/admin/batches
 * List batch progress records
 */
router.get('/batches', asyncHandler(async (req: Request, res: Response) => {
  try {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();
    
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.page_size as string) || 20, 100);
    const offset = (page - 1) * pageSize;
    const status = req.query.status as string;
    
    const result = await withConnection(async (conn) => {
      let whereClause = 'WHERE b.TENANT_ID = :tenantId';
      const binds: any = { tenantId };
      
      if (status) {
        whereClause += ' AND b.STATUS = :status';
        binds.status = status;
      }
      
      const countResult = await conn.execute(
        `SELECT COUNT(*) as total FROM ATTR_MGR.AI_BATCH_PROGRESS b ${whereClause}`,
        binds
      );
      const total = (countResult.rows as any[])?.[0]?.[0] || 0;
      
      const dataResult = await conn.execute(
        `SELECT b.BATCH_ID, b.TENANT_ID, b.BUSINESS_UNIT_ID,
                b.TOTAL_ITEMS, b.PROCESSED_ITEMS, b.SUCCESS_COUNT, b.ERROR_COUNT,
                b.STATUS, b.CURRENT_STYLE_ID,
                b.STARTED_AT, b.COMPLETED_AT, b.CREATED_BY,
                ROUND((b.PROCESSED_ITEMS / NULLIF(b.TOTAL_ITEMS, 0)) * 100, 1) as PROGRESS_PCT,
                (SELECT SUM(COST_USD) FROM ATTR_MGR.AI_MODEL_RUNS WHERE BATCH_ID = b.BATCH_ID) as TOTAL_COST,
                (SELECT SUM(TOKENS_INPUT) + SUM(TOKENS_OUTPUT) FROM ATTR_MGR.AI_MODEL_RUNS WHERE BATCH_ID = b.BATCH_ID) as TOTAL_TOKENS
         FROM ATTR_MGR.AI_BATCH_PROGRESS b
         ${whereClause}
         ORDER BY b.STARTED_AT DESC
         OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
        { ...binds, offset, pageSize },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      return {
        batches: dataResult.rows || [],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    });
    
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Failed to fetch batches', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/admin/stats
 * Get aggregate statistics for the admin dashboard
 */
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  try {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();
    const days = parseInt(req.query.days as string) || 30;
    
    const result = await withConnection(async (conn) => {
      // Overall stats
      const overallResult = await conn.execute(
        `SELECT 
           COUNT(*) as total_runs,
           COUNT(CASE WHEN STATUS = 'success' THEN 1 END) as success_count,
           COUNT(CASE WHEN STATUS = 'error' THEN 1 END) as error_count,
           SUM(NVL(COST_USD, 0)) as total_cost,
           SUM(NVL(TOKENS_INPUT, 0)) as total_input_tokens,
           SUM(NVL(TOKENS_OUTPUT, 0)) as total_output_tokens,
           AVG(LATENCY_MS) as avg_latency,
           AVG(CONFIDENCE) as avg_confidence
         FROM ATTR_MGR.AI_MODEL_RUNS
         WHERE TENANT_ID = :tenantId
           AND CREATED_AT >= SYSDATE - :days`,
        { tenantId, days },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      // By provider
      const providerResult = await conn.execute(
        `SELECT PROVIDER, COUNT(*) as count, 
                SUM(NVL(COST_USD, 0)) as cost,
                AVG(LATENCY_MS) as avg_latency,
                AVG(CONFIDENCE) as avg_confidence
         FROM ATTR_MGR.AI_MODEL_RUNS
         WHERE TENANT_ID = :tenantId AND CREATED_AT >= SYSDATE - :days
         GROUP BY PROVIDER`,
        { tenantId, days },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      // Daily trend (last 7 days)
      const trendResult = await conn.execute(
        `SELECT TRUNC(CREATED_AT) as day,
                COUNT(*) as runs,
                SUM(NVL(COST_USD, 0)) as cost,
                COUNT(CASE WHEN STATUS = 'success' THEN 1 END) as success,
                COUNT(CASE WHEN STATUS = 'error' THEN 1 END) as errors
         FROM ATTR_MGR.AI_MODEL_RUNS
         WHERE TENANT_ID = :tenantId AND CREATED_AT >= SYSDATE - 7
         GROUP BY TRUNC(CREATED_AT)
         ORDER BY day`,
        { tenantId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      // Recent batches summary
      const batchesResult = await conn.execute(
        `SELECT STATUS, COUNT(*) as count
         FROM ATTR_MGR.AI_BATCH_PROGRESS
         WHERE TENANT_ID = :tenantId AND STARTED_AT >= SYSDATE - :days
         GROUP BY STATUS`,
        { tenantId, days },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      // Top errors
      const errorsResult = await conn.execute(
        `SELECT ERROR_CODE, COUNT(*) as COUNT
         FROM ATTR_MGR.AI_MODEL_RUNS
         WHERE TENANT_ID = :tenantId 
           AND STATUS = 'error' 
           AND ERROR_CODE IS NOT NULL
           AND CREATED_AT >= SYSDATE - :days
         GROUP BY ERROR_CODE
         ORDER BY COUNT DESC
         FETCH FIRST 5 ROWS ONLY`,
        { tenantId, days },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      return {
        overall: overallResult.rows?.[0] || {},
        byProvider: providerResult.rows || [],
        dailyTrend: trendResult.rows || [],
        batchesByStatus: batchesResult.rows || [],
        topErrors: errorsResult.rows || []
      };
    });
    
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Failed to fetch stats', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/admin/ai-runs/:runId/retry
 * Retry a failed AI run
 */
router.post('/ai-runs/:runId/retry', asyncHandler(async (req: Request, res: Response) => {
  try {
    const runId = parseInt(req.params.runId as string);
    
    // Get the original run details
    const original = await withConnection(async (conn) => {
      const result = await conn.execute(
        `SELECT BUSINESS_UNIT_ID, STYLE_ID, COLOR_ID 
         FROM ATTR_MGR.AI_MODEL_RUNS WHERE RUN_ID = :runId`,
        { runId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return result.rows?.[0] as any;
    });
    
    if (!original) {
      return res.status(404).json({ success: false, error: { message: 'Run not found' } });
    }
    
    // Import and call extraction service
    const { attributesService } = await import('../services/attributes.service.js');
    
    // Get image URL from cache
    const cacheResult = await withConnection(async (conn) => {
      const result = await conn.execute(
        `SELECT IMAGE_URL FROM ATTR_MGR.CATALOG_CACHE_SHADOW 
         WHERE BUSINESS_UNIT_ID = :buId AND STYLE_ID = :styleId
         FETCH FIRST 1 ROWS ONLY`,
        { buId: original.BUSINESS_UNIT_ID, styleId: original.STYLE_ID }
      );
      return (result.rows?.[0] as any)?.[0];
    });
    
    if (!cacheResult) {
      return res.status(400).json({ success: false, error: { message: 'No image URL found for this style' } });
    }
    
    const result = await attributesService.extractBatch(original.BUSINESS_UNIT_ID, [{
      styleId: original.STYLE_ID,
      colorId: original.COLOR_ID || '000',
      imageUrl: cacheResult,
      focusedAttributes: []
    }]);
    
    return res.json({ success: true, data: result[0] });
  } catch (error: any) {
    logger.error('Retry failed', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/admin/jobs
 * Get background jobs
 */
router.get('/jobs', asyncHandler(async (req: Request, res: Response) => {
  try {
    const result = await withConnection(async (conn) => {
      const dataResult = await conn.execute(
        `SELECT JOB_ID, JOB_TYPE, STATUS, PRIORITY, ATTEMPT_COUNT as ATTEMPTS, MAX_ATTEMPTS,
                RUN_AFTER as SCHEDULED_AT, UPDATED_AT, 
                LAST_ERROR_MESSAGE as ERROR_MESSAGE, CREATED_AT
         FROM ATTR_MGR.JOB_QUEUE
         ORDER BY CREATED_AT DESC
         FETCH FIRST 100 ROWS ONLY`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return dataResult.rows || [];
    });
    
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Failed to fetch jobs', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/admin/quality/runs
 * Get quality firewall runs (existing functionality)
 */
router.get('/quality/runs', asyncHandler(async (req: Request, res: Response) => {
  try {
    const result = await withConnection(async (conn) => {
      const dataResult = await conn.execute(
        `SELECT RUN_ID, SCOPE, SCOPE_ID, STATUS, SUMMARY_JSON, CREATED_AT
         FROM ATTR_MGR.QUALITY_RUNS
         ORDER BY CREATED_AT DESC
         FETCH FIRST 50 ROWS ONLY`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return dataResult.rows || [];
    });
    
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Failed to fetch quality runs', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

export default router;
