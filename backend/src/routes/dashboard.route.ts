/**
 * Dashboard API Routes
 * Provides aggregate metrics and priority queues for 100K+ scale
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { withConnection } from '../services/oracle-pool.js';
import oracledb from 'oracledb';
import { asyncHandler } from '../middleware/oracle-error-handler.js';

const router = Router();

/**
 * GET /api/dashboard/pulse
 * 
 * Returns "Attention-First" metrics for the landing page:
 * - Funnel Heatmap across the whole BU
 * - Bottlenecks & Friction Points
 * - New Arrivals (last 48h)
 * - Empty Factory Check
 */
router.get('/pulse', asyncHandler(async (req: Request, res: Response) => {
  try {
    const businessUnitId = parseInt(req.query.business_unit_id as string, 10);
    
    if (isNaN(businessUnitId) || businessUnitId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'business_unit_id is required' }
      });
    }

    const pulse = await withConnection(async (conn) => {
      // Get active tenant
      let tenantId = 'DEV';
      try {
        const res = await conn.execute(`SELECT env_id FROM APP_ENVIRONMENTS WHERE is_active = 'Y' AND ROWNUM = 1`);
        tenantId = (res.rows?.[0] as any)?.[0] || (res.rows?.[0] as any)?.ENV_ID || 'DEV';
      } catch (e) { /* fallback */ }

      // 1. BU-Level Funnel Stats (using CATALOG_CACHE_SHADOW + STAGING_STYLES)
      const funnelRes = await conn.execute(
        `SELECT
          (SELECT COUNT(*) FROM CATALOG_CACHE_SHADOW s 
           WHERE s.TENANT_ID = :tenant AND s.BUSINESS_UNIT_ID = :buId) AS TOTAL,
          
          (SELECT COUNT(*) FROM CATALOG_CACHE_SHADOW s 
           WHERE s.TENANT_ID = :tenant AND s.BUSINESS_UNIT_ID = :buId 
           AND s.HAS_IMAGE_IND = 'N') AS MISSING_IMAGES,
          
          (SELECT COUNT(*) FROM CATALOG_CACHE_SHADOW s
           LEFT JOIN AI_ATTRIBUTION_RESULTS ai
             ON ai.TENANT_ID = s.TENANT_ID
             AND ai.BUSINESS_UNIT_ID = s.BUSINESS_UNIT_ID
             AND ai.STYLE_ID = s.STYLE_ID
             AND ai.COLOR_ID = '000'
           WHERE s.TENANT_ID = :tenant AND s.BUSINESS_UNIT_ID = :buId
           AND s.HAS_IMAGE_IND = 'Y' AND (ai.STATUS IS NULL OR ai.STATUS = 'pending')) AS READY_FOR_AI,
          
          (SELECT COUNT(*) FROM CATALOG_CACHE_SHADOW s
           JOIN AI_ATTRIBUTION_RESULTS ai
             ON ai.TENANT_ID = s.TENANT_ID
             AND ai.BUSINESS_UNIT_ID = s.BUSINESS_UNIT_ID
             AND ai.STYLE_ID = s.STYLE_ID
             AND ai.COLOR_ID = '000'
           WHERE s.TENANT_ID = :tenant AND s.BUSINESS_UNIT_ID = :buId
           AND ai.STATUS = 'success') AS AI_REVIEW,
          
          (SELECT COUNT(*) FROM CATALOG_CACHE_SHADOW s
           JOIN AI_ATTRIBUTION_RESULTS ai
             ON ai.TENANT_ID = s.TENANT_ID
             AND ai.BUSINESS_UNIT_ID = s.BUSINESS_UNIT_ID
             AND ai.STYLE_ID = s.STYLE_ID
             AND ai.COLOR_ID = '000'
           WHERE s.TENANT_ID = :tenant AND s.BUSINESS_UNIT_ID = :buId
           AND ai.STATUS = 'accepted') AS SYNC_READY,

          (SELECT COUNT(*) FROM STAGING_STYLES
           WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :buId
           AND DRAFT_STATUS = 'DRAFT') AS DRAFTS,

          (SELECT COUNT(*) FROM STAGING_STYLES
           WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :buId
           AND DRAFT_STATUS = 'READY') AS PENDING_PROMOTION
         FROM DUAL`,
        { tenant: tenantId, buId: businessUnitId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const stats = (funnelRes.rows?.[0] || { 
        TOTAL: 0, 
        MISSING_IMAGES: 0, 
        READY_FOR_AI: 0, 
        AI_REVIEW: 0, 
        SYNC_READY: 0,
        DRAFTS: 0,
        PENDING_PROMOTION: 0
      }) as any;
      
      // 2. Identify Top 3 "Attention Cards"
      const cards = [];

      // Card 0: Pending Promotion (New Draft Styles)
      if (stats.PENDING_PROMOTION > 0) {
        cards.push({
          id: 'pending_promotion',
          type: 'success',
          title: `${stats.PENDING_PROMOTION} Drafts Ready for ERP`,
          description: `New styles are 100% complete. Promote them to production.`,
          action: 'Promote Now',
          filter: { step: 'pending_promotion' },
          priority: 5
        });
      }

      // Card 1: New Drafts in Progress
      if (stats.DRAFTS > 0) {
        cards.push({
          id: 'drafts_in_progress',
          type: 'info',
          title: `${stats.DRAFTS} Drafts in Progress`,
          description: `Finish mandatory fields to enable ERP creation.`,
          action: 'Finish Drafts',
          filter: { step: 'drafts' },
          priority: 4
        });
      }
      
      // Card A: New Arrivals (Last 30 days - adjusted for dev data)
      const newArrivalsRes = await conn.execute(
        `SELECT COUNT(*) as COUNT 
         FROM CATALOG_CACHE_SHADOW 
         WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :buId 
         AND DATE_CREATED >= (SYSTIMESTAMP - INTERVAL '30' DAY)`,
        { tenant: tenantId, buId: businessUnitId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const newCount = (newArrivalsRes.rows?.[0] as any)?.COUNT || 0;
      if (newCount > 0) {
        cards.push({
          id: 'new_arrivals',
          type: 'info',
          title: `${newCount} New Arrivals`,
          description: `Styles created in the last 30 days need initial setup.`,
          action: 'Review New',
          filter: { status: 'all', date_range: '30d' },
          priority: 1
        });
      }

      // ... existing card logic ...
      if (stats.MISSING_IMAGES > 0) {
        cards.push({
          id: 'missing_images',
          type: 'warning',
          title: `${stats.MISSING_IMAGES} Missing Images`,
          description: `Critical blockage: Styles cannot be enriched without images.`,
          action: 'Upload Images',
          filter: { step: 'missing_images' },
          priority: 3
        });
      }

      if (stats.AI_REVIEW > 0) {
        cards.push({
          id: 'ai_review',
          type: 'magic',
          title: `${stats.AI_REVIEW} Styles Ready for Review`,
          description: `AI has generated attributes. Please verify and sync.`,
          action: 'Start Review',
          filter: { step: 'ai_review' },
          priority: 2
        });
      }

      // 3. Department Pulse (Where is the focus needed?)
      const deptPulseRes = await conn.execute(
        `SELECT 
          s.DEPARTMENT_ID as ID,
          s.DEPT_NAME as NAME,
          COUNT(*) as TOTAL,
          COUNT(CASE WHEN s.HAS_IMAGE_IND = 'N' THEN 1 END) as MISSING_IMAGES,
          COUNT(CASE WHEN s.HAS_IMAGE_IND = 'Y' AND ai.STATUS IS NULL THEN 1 END) as READY_FOR_AI,
          COUNT(CASE WHEN ai.STATUS = 'success' THEN 1 END) as AI_REVIEW
         FROM CATALOG_CACHE_SHADOW s
         LEFT JOIN AI_ATTRIBUTION_RESULTS ai
           ON ai.TENANT_ID = s.TENANT_ID
           AND ai.BUSINESS_UNIT_ID = s.BUSINESS_UNIT_ID
           AND ai.STYLE_ID = s.STYLE_ID
           AND ai.COLOR_ID = '000'
         WHERE s.TENANT_ID = :tenant AND s.BUSINESS_UNIT_ID = :buId
         GROUP BY s.DEPARTMENT_ID, s.DEPT_NAME
         HAVING COUNT(CASE WHEN s.HAS_IMAGE_IND = 'N' THEN 1 END) > 0 
            OR COUNT(CASE WHEN ai.STATUS = 'success' THEN 1 END) > 0
            OR COUNT(CASE WHEN s.HAS_IMAGE_IND = 'Y' AND ai.STATUS IS NULL THEN 1 END) > 0
         ORDER BY (COUNT(CASE WHEN s.HAS_IMAGE_IND = 'Y' AND ai.STATUS IS NULL THEN 1 END) + COUNT(CASE WHEN ai.STATUS = 'success' THEN 1 END)) DESC
         FETCH NEXT 8 ROWS ONLY`,
        { tenant: tenantId, buId: businessUnitId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const departmentFocus = deptPulseRes.rows?.map((d: any) => ({
        id: d.ID,
        name: d.NAME?.trim() || d.ID,
        total: d.TOTAL,
        missingImages: d.MISSING_IMAGES,
        readyForAi: d.READY_FOR_AI,
        aiReview: d.AI_REVIEW
      })) || [];

      return {
        funnel: {
          total: stats.TOTAL,
          drafts: stats.DRAFTS,
          pending_promotion: stats.PENDING_PROMOTION,
          missing_images: stats.MISSING_IMAGES,
          ready_for_ai: stats.READY_FOR_AI,
          ai_review: stats.AI_REVIEW,
          sync_ready: stats.SYNC_READY
        },
        cards: cards.sort((a, b) => b.priority - a.priority),
        departmentFocus,
        factoryEmpty: stats.TOTAL === stats.SYNC_READY && stats.TOTAL > 0
      };
    });

    return res.json({
      success: true,
      data: pulse
    });
  } catch (error: any) {
    const isDbLinkError = error.message.includes('MERCH_REMOTE') || error.message.includes('ORA-02063');
    
    logger.error('Error fetching dashboard pulse', { 
      error: error.message,
      isDbLinkError
    });

    if (isDbLinkError) {
      return res.status(200).json({
        success: false,
        data: {
          funnel: { total: 0, missing_images: 0, ready_for_ai: 0, ai_review: 0, sync_ready: 0 },
          cards: [],
          departmentFocus: [],
          factoryEmpty: false
        },
        error: { 
          code: 'DB_LINK_ERROR', 
          message: 'Merch ERP connection error. Please verify DB Link settings in Admin Settings.',
          isActionable: true
        }
      });
    }

    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
}));

export default router;

