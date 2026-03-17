/**
 * Attributes API Routes (Boring Vanilla)
 * 
 * Clean request handling for AI extraction and mapping.
 * Logic moved to services and attributes-db for better maintainability.
 */

import { Router, Request, Response } from 'express';
import { attributesService } from '../services/attributes.service.js';
import { productsService } from '../services/products.service.js';
import * as db from '../services/attributes/attributes-db.js';
import { AttributeDefinitionService } from '../services/attributes/attribute-definition.service.js';
import { logger } from '../utils/logger.js';
import { extractLimiter } from '../middleware/rate-limit.js';
import { withConnection } from '../services/oracle-pool.js';
import oracledb from 'oracledb';
import { insertIriStyleSync, insertIriCharacteristicSync, insertIriStyleForeignDescSync } from '../services/sync/sync-db.js';
import { SettingsService } from '../services/settings.service.js';
import { batchProgressService } from '../services/llm/batch-progress.service.js';
import { asyncHandler } from '../middleware/oracle-error-handler.js';

const router = Router();

/**
 * POST /api/attributes/extract/batch
 * Batch extraction with progress tracking (v8.3)
 */
router.post('/extract/batch', extractLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { business_unit_id, images } = req.body;
    if (!business_unit_id || !images?.length) return res.status(400).json({ success: false, error: { message: 'invalid request' } });

    const results = await attributesService.extractBatch(business_unit_id, images.map((img: any) => ({
      styleId: img.style_id,
      colorId: img.color_id,
      imageUrl: img.image_url,
      focusedAttributes: img.focused_attributes
    })));
    
    // v8.3: Return batch ID if available
    const batchId = results[0]?.batchId;
    return res.json({ success: true, data: results, batchId });
  } catch (error: any) {
    logger.error('Batch extraction failed', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/attributes/extract/batch/:batchId/progress
 * Get batch progress (v8.3 - P1)
 */
router.get('/extract/batch/:batchId/progress', asyncHandler(async (req: Request, res: Response) => {
  try {
    const batchId = req.params.batchId as string;
    const progress = await batchProgressService.getProgress(batchId);
    
    if (!progress) {
      return res.status(404).json({ success: false, error: { message: 'Batch not found' } });
    }
    
    return res.json({ 
      success: true, 
      data: {
        batchId: progress.batchId,
        status: progress.status,
        totalItems: progress.totalItems,
        processedItems: progress.processedItems,
        successCount: progress.successCount,
        errorCount: progress.errorCount,
        progressPercent: progress.totalItems > 0 
          ? Math.round((progress.processedItems / progress.totalItems) * 100) 
          : 0,
        currentStyleId: progress.currentStyleId,
        startedAt: progress.startedAt,
        completedAt: progress.completedAt
      }
    });
  } catch (error: any) {
    logger.error('Get batch progress failed', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/attributes/extract/batches/active
 * Get active batches for current tenant (v8.3 - P1)
 */
router.get('/extract/batches/active', asyncHandler(async (req: Request, res: Response) => {
  try {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();
    const businessUnitId = req.query.business_unit_id ? parseInt(req.query.business_unit_id as string) : undefined;
    
    const batches = await batchProgressService.getActiveBatches(tenantId, businessUnitId);
    
    return res.json({ 
      success: true, 
      data: batches.map(b => ({
        batchId: b.batchId,
        status: b.status,
        totalItems: b.totalItems,
        processedItems: b.processedItems,
        successCount: b.successCount,
        errorCount: b.errorCount,
        progressPercent: b.totalItems > 0 
          ? Math.round((b.processedItems / b.totalItems) * 100) 
          : 0,
        currentStyleId: b.currentStyleId,
        startedAt: b.startedAt
      }))
    });
  } catch (error: any) {
    logger.error('Get active batches failed', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/attributes/review/grid
 * Paginated review grid with funnel stats
 */
router.get('/review/grid', asyncHandler(async (req: Request, res: Response) => {
  try {
    const businessUnitId = parseInt(req.query.business_unit_id as string, 10);
    if (isNaN(businessUnitId)) return res.status(400).json({ success: false, error: { message: 'buId required' } });

    const parseArrayParam = (param: any): string[] | undefined => {
      if (!param) return undefined;
      if (Array.isArray(param)) return param.map(String);
      return [String(param)];
    };

    // Use ProductsService for Unified Authoring
    const result = await productsService.getProducts({
      businessUnitId,
      mode: (req.query.status === 'drafts' || req.query.step === 'drafts' || req.query.step === 'pending_promotion') ? 'new' : 'existing',
      step: req.query.step as string,
      search: req.query.search as string,
      departments: parseArrayParam(req.query.department_id),
      categories: parseArrayParam(req.query.class_id),
      subCategories: parseArrayParam(req.query.subclass_id),
      brands: parseArrayParam(req.query.brand_id),
      seasons: parseArrayParam(req.query.season_id),
      vendors: parseArrayParam(req.query.vendor_id),
      banners: parseArrayParam(req.query.banner_id),
      dateRange: req.query.date_range as string,
      hasImages: req.query.has_images === 'true' ? true : (req.query.has_images === 'false' ? false : undefined),
      limit: parseInt(req.query.page_size as string, 10) || 50,
      offset: (parseInt(req.query.page as string, 10) - 1) * (parseInt(req.query.page_size as string, 10) || 50)
    });

    // Adapt to expected frontend format
    return res.json({
      success: true,
      data: {
        products: result.data,
        total: result.total,
        page: (result.offset / result.limit) + 1,
        pageSize: result.limit,
        totalPages: result.totalPages,
        funnel: {} // Funnel is now handled by dashboard/pulse, but we keep this for compatibility
      }
    });
  } catch (error: any) {
    logger.error('Grid fetch failed', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/attributes/compare/bulk
 * Detailed comparison for Audit Inspector
 */
router.post('/compare/bulk', asyncHandler(async (req: Request, res: Response) => {
  try {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();
    const { business_unit_id: buId, style_ids } = req.body;
    if (!buId || !style_ids?.length) return res.status(400).json({ success: false });

    const { groupMap, typeToGroup } = await db.getAttributeGroupsMetadata(tenantId, buId);
    
    // Add dynamic Content and AI Suggested groups
    groupMap.set('CONTENT', { name: 'Product Content', order: 5 });
    groupMap.set('AI_SUGGESTED', { name: 'AI Suggestions', order: 6 });
    
    const results = await Promise.all(style_ids.slice(0, 50).map(async (sid: string) => {
      try {
        const productRes = await withConnection(conn => conn.execute(
          `SELECT s.DEPARTMENT_ID, s.CLASS_ID, s.SUB_CLASS_ID, s.DESCRIPTION,
                  ai.SHORT_STYLE_DESC, ai.LONG_STYLE_DESC, ai.ADDITIONAL_ATTRIBUTES, ai.STATUS as AI_STATUS,
                  fd.DESCRIPTION as EXISTING_SHORT, fd.WEB_DESCRIPTION as EXISTING_LONG
           FROM CATALOG_CACHE_SHADOW s
           LEFT JOIN AI_ATTRIBUTION_RESULTS ai ON ai.TENANT_ID = s.TENANT_ID AND ai.BUSINESS_UNIT_ID = s.BUSINESS_UNIT_ID AND ai.STYLE_ID = s.STYLE_ID AND ai.COLOR_ID = '000'
           LEFT JOIN style_foreign_descriptions fd ON fd.BUSINESS_UNIT_ID = s.BUSINESS_UNIT_ID AND fd.STYLE_ID = s.STYLE_ID AND fd.LANGUAGE_ID = 'ENG'
           WHERE s.TENANT_ID = :tenantId AND s.BUSINESS_UNIT_ID = :buId AND s.STYLE_ID = :sid`,
          { tenantId, buId, sid },
          { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { ADDITIONAL_ATTRIBUTES: { type: oracledb.STRING } } }
        ));
        const p = productRes.rows?.[0] as any;
        
        // Parse AI additional attributes if present
        let aiAttributes: any[] = [];
        if (p?.ADDITIONAL_ATTRIBUTES) {
          try {
            aiAttributes = typeof p.ADDITIONAL_ATTRIBUTES === 'string' 
              ? JSON.parse(p.ADDITIONAL_ATTRIBUTES) 
              : p.ADDITIONAL_ATTRIBUTES;
            if (!Array.isArray(aiAttributes)) aiAttributes = [];
          } catch { aiAttributes = []; }
        }
        
        let rules: any[] = [];
        if (p) rules = await new AttributeDefinitionService().getEffectiveRules(tenantId, buId, p.DEPARTMENT_ID, p.CLASS_ID, p.SUB_CLASS_ID, sid);

        const dbAttrs = await db.getProductAttributes(buId, sid);
        const vAttrs = await db.getVendorAttributes(buId, sid);
        const attrMap = new Map<string, any>();

        // Descriptions Section
        if (p) {
          attrMap.set('SHORT_DESCRIPTION', {
            name: 'Short Description', type_id: 'SHORT_DESCRIPTION',
            db_value: p.EXISTING_SHORT || p.DESCRIPTION?.substring(0, 60), 
            ai_value: p.SHORT_STYLE_DESC,
            selected_value: p.SHORT_STYLE_DESC || p.EXISTING_SHORT || p.DESCRIPTION?.substring(0, 60),
            selected_source: p.SHORT_STYLE_DESC ? 'ai' : 'db',
            group_id: 'CONTENT', group_name: 'Product Content',
            mandatory: 'Y', status: p.SHORT_STYLE_DESC ? 'review' : 'synced'
          });
          attrMap.set('LONG_DESCRIPTION', {
            name: 'Long Description', type_id: 'LONG_DESCRIPTION',
            db_value: p.EXISTING_LONG, 
            ai_value: p.LONG_STYLE_DESC,
            selected_value: p.LONG_STYLE_DESC || p.EXISTING_LONG,
            selected_source: p.LONG_STYLE_DESC ? 'ai' : 'db',
            group_id: 'CONTENT', group_name: 'Product Content',
            mandatory: 'Y', status: p.LONG_STYLE_DESC ? 'review' : 'synced'
          });
        }

        // Build a lookup map for AI attributes by type ID (erpTypeId from mapped attrs)
        const aiAttrLookup = new Map<string, { value: string; confidence: number }>();
        aiAttributes.forEach((a: any) => {
          // Try erpTypeId first (if attribute was mapped to ERP)
          if (a.erpTypeId) {
            aiAttrLookup.set(a.erpTypeId, { 
              value: a.erpValueDesc || a.aiValue || a.value || '', 
              confidence: a.confidence || 0 
            });
          }
          // Use attribute name as key (handles both 'name' and 'attribute' fields)
          const attrName = a.name || a.attribute;
          if (attrName) {
            const key = attrName.toUpperCase().replace(/[\s-]+/g, '_');
            aiAttrLookup.set(key, { 
              value: a.aiValue || a.erpValueDesc || a.value || '', 
              confidence: a.confidence || 0 
            });
          }
        });

        rules.forEach(r => {
          const aiMatch = aiAttrLookup.get(r.characteristicTypeId);
          attrMap.set(r.characteristicTypeId, {
            name: r.characteristicName || r.characteristicTypeId, type_id: r.characteristicTypeId,
            db_value: null, vendor_value: null, 
            ai_value: aiMatch?.value || null, 
            confidence: aiMatch?.confidence || 0,
            mandatory: r.isMandatory ? 'Y' : 'N', applicability: r.applicability,
            group_id: typeToGroup.get(r.characteristicTypeId) || 'GENERAL',
            group_name: groupMap.get(typeToGroup.get(r.characteristicTypeId))?.name || 'General Info',
            status: aiMatch?.value ? 'review' : 'pending',
            selected_value: aiMatch?.value || null,
            selected_source: aiMatch?.value ? 'ai' : null
          });
        });

        dbAttrs.forEach(a => {
          const gId = typeToGroup.get(a.typeId) || 'EXISTING';
          attrMap.set(a.typeId, {
            ...attrMap.get(a.typeId), name: a.typeDescription, type_id: a.typeId, db_value: a.description,
            group_id: gId, group_name: groupMap.get(gId)?.name || 'Existing Attributes',
            selected_value: a.description, selected_source: 'db', status: 'synced'
          });
        });

        vAttrs.forEach(a => {
          const key = a.name.toUpperCase().replace(/\s+/g, '_');
          const entry = attrMap.get(key) || { name: a.name, type_id: key, group_id: 'VENDOR', group_name: 'Vendor Info' };
          entry.vendor_value = a.value;
          if (!entry.db_value) { entry.selected_value = a.value; entry.selected_source = 'vendor'; entry.status = 'review'; }
          attrMap.set(key, entry);
        });

        // Add AI-suggested attributes not already in rules (e.g., style_characteristics)
        aiAttributes.forEach((a: any) => {
          const attrName = a.name || a.attribute;
          const key = a.erpTypeId || (attrName?.toUpperCase().replace(/[\s-]+/g, '_'));
          const aiValue = a.aiValue || a.erpValueDesc || a.value || '';
          
          // Only add if we have a key, a value, and it's not already in the map
          if (key && aiValue && aiValue !== 'N/A' && !attrMap.has(key)) {
            attrMap.set(key, {
              name: attrName || a.erpTypeId || key,
              type_id: key,
              db_value: null,
              vendor_value: null,
              ai_value: aiValue,
              confidence: a.confidence || 0,
              mandatory: 'N',
              applicability: 'OPTIONAL',
              group_id: 'AI_SUGGESTED',
              group_name: 'AI Suggestions',
              status: 'review',
              selected_value: aiValue,
              selected_source: 'ai'
            });
          }
        });

        const grouped = Array.from(attrMap.values()).reduce((acc, a) => {
          if (!acc[a.group_id]) {
            acc[a.group_id] = { 
              group_id: a.group_id, 
              group_name: a.group_name, 
              is_expanded: true, 
              attributes: [],
              completeness: { filled: 0, total: 0 }
            };
          }
          acc[a.group_id].attributes.push(a);
          acc[a.group_id].completeness.total++;
          if (a.selected_value) acc[a.group_id].completeness.filled++;
          return acc;
        }, {} as any);

        return { style_id: sid, grouped_attributes: Object.values(grouped).sort((a: any, b: any) => (groupMap.get(a.group_id)?.order || 99) - (groupMap.get(b.group_id)?.order || 99)) };
      } catch (e: any) {
        return { style_id: sid, error: e.message, grouped_attributes: [] };
      }
    }));

    return res.json({ success: true, data: results });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/attributes/review/validate/:styleId
 * Validate mandatory attributes before sync
 */
router.get('/review/validate/:styleId', asyncHandler(async (req: Request, res: Response) => {
  try {
    const buId = parseInt(req.query.business_unit_id as string, 10);
    const styleId = req.params.styleId as string;
    if (!buId || !styleId) return res.status(400).json({ success: false });

    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();

    const validation = await new AttributeDefinitionService().validateMandatoryAttributes(tenantId, buId, styleId);
    return res.json({ success: true, data: validation });
  } catch (error: any) {
    logger.error('Validation failed', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/attributes/review/accept
 */
router.post('/review/accept', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { business_unit_id: buId, style_id: sid, color_id = '000', skip_validation = false } = req.body;
    if (!buId || !sid) return res.status(400).json({ success: false });

    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();

    // Mode check - ONLY block synchronization to external ERP (IRI tables)
    if (!settings.isWriteAllowed()) {
      return res.status(403).json({ success: false, error: { message: 'ERP Synchronization is disabled in READ_ONLY mode' } });
    }

    // Mandatory validation (can be skipped with explicit flag)
    if (!skip_validation) {
      const validation = await new AttributeDefinitionService().validateMandatoryAttributes(tenantId, buId, sid);
      if (!validation.isValid) {
        return res.status(422).json({ 
          success: false, 
          error: { 
            code: 'MANDATORY_VALIDATION_FAILED',
            message: `Missing ${validation.missingAttributes.length} mandatory attribute(s)`,
            missingAttributes: validation.missingAttributes
          }
        });
      }
    }

    const aiRow = await db.getAiResultForAcceptance(tenantId, buId, sid, color_id);
    if (aiRow) await db.updateAiResultStatus(tenantId, buId, sid, color_id, 'accepted');

    const jobId = Math.floor(Date.now() / 1000);
    
    // 1. Sync Main Description
    await insertIriStyleSync({ 
      jobId, 
      businessUnitId: buId, 
      styleId: sid, 
      description: aiRow?.SHORT_STYLE_DESC || aiRow?.LONG_STYLE_DESC || sid 
    });

    // 2. Sync Foreign/Web Descriptions (Magic: Extended Content)
    if (aiRow?.LONG_STYLE_DESC || aiRow?.SHORT_STYLE_DESC) {
      await insertIriStyleForeignDescSync({
        jobId,
        businessUnitId: buId,
        styleId: sid,
        languageId: 'ENG',
        description: aiRow?.SHORT_STYLE_DESC || sid,
        webDescription: aiRow?.LONG_STYLE_DESC,
        longDescription: aiRow?.LONG_STYLE_DESC
      });
    }

    // 3. Sync Characteristics
    if (aiRow?.ADDITIONAL_ATTRIBUTES) {
      const attrs = typeof aiRow.ADDITIONAL_ATTRIBUTES === 'string' ? JSON.parse(aiRow.ADDITIONAL_ATTRIBUTES) : aiRow.ADDITIONAL_ATTRIBUTES;
      if (Array.isArray(attrs)) {
        for (const a of attrs) if (a.erpTypeId && a.erpValueId) {
          await insertIriCharacteristicSync({ jobId, businessUnitId: buId, styleId: sid, typeId: a.erpTypeId, valueId: a.erpValueId, description: a.erpValueDesc });
        }
      }
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/attributes/review/promote
 * Promote a 100% complete draft to real IRI tables
 */
router.post('/review/promote', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { business_unit_id: buId, style_id: sid } = req.body;
    if (!buId || !sid) return res.status(400).json({ success: false });

    // Handle session ID vs style ID
    let sessionId: number;
    if (sid.startsWith('DRAFT_')) {
      sessionId = parseInt(sid.replace('DRAFT_', ''), 10);
    } else {
      const sessionRes = await withConnection(async (conn) => {
        const res = await conn.execute(
          `SELECT SESSION_ID FROM STAGING_STYLES WHERE BUSINESS_UNIT_ID = :buId AND STYLE_ID = :sid AND DRAFT_STATUS != 'PROMOTED' FETCH NEXT 1 ROWS ONLY`,
          { buId, sid }
        );
        return (res.rows?.[0] as any)?.[0] || (res.rows?.[0] as any)?.SESSION_ID;
      });
      if (!sessionRes) return res.status(404).json({ success: false, error: { message: 'Draft not found or already promoted' } });
      sessionId = sessionRes;
    }

    const result = await withConnection(async (conn) => {
      const res = await conn.execute(
        `BEGIN ATTR_MGR.PROMOTION_PKG.promote_draft(:sid, :jobId, :status, :error); END;`,
        {
          sid: sessionId,
          jobId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
          error: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 1000 }
        }
      );

      return {
        jobId: (res.outBinds as any).jobId,
        status: (res.outBinds as any).status,
        error: (res.outBinds as any).error
      };
    });

    if (result.status === 'ERROR') {
      return res.status(400).json({ success: false, error: { message: result.error } });
    }

    return res.json({ success: true, data: { jobId: result.jobId } });
  } catch (error: any) {
    logger.error('Promotion failed', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/attributes/review/reject
 */
router.post('/review/reject', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { business_unit_id: buId, style_id: sid, color_id = '000' } = req.body;
    if (!buId || !sid) return res.status(400).json({ success: false });
    
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();

    await db.updateAiResultStatus(tenantId, buId, sid, color_id, 'rejected');
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/attributes/review/accept-bulk
 * P1: Bulk accept AI suggestions for multiple styles
 */
router.post('/review/accept-bulk', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { business_unit_id: buId, style_ids } = req.body;
    if (!buId || !style_ids?.length) {
      return res.status(400).json({ success: false, error: { message: 'business_unit_id and style_ids[] required' } });
    }

    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();

    if (!settings.isWriteAllowed()) {
      return res.status(403).json({ success: false, error: { message: 'ERP Synchronization is disabled in READ_ONLY mode' } });
    }

    const results: { styleId: string; success: boolean; error?: string }[] = [];

    for (const sid of style_ids.slice(0, 100)) { // Limit to 100 at a time
      try {
        await db.updateAiResultStatus(tenantId, buId, sid, '000', 'accepted');
        results.push({ styleId: sid, success: true });
      } catch (err: any) {
        results.push({ styleId: sid, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return res.json({ 
      success: true, 
      data: { 
        processed: results.length, 
        approved: successCount, 
        failed: results.length - successCount,
        details: results.filter(r => !r.success)
      } 
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/attributes/review/reject-bulk
 * P1: Bulk reject AI suggestions for multiple styles
 */
router.post('/review/reject-bulk', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { business_unit_id: buId, style_ids } = req.body;
    if (!buId || !style_ids?.length) {
      return res.status(400).json({ success: false, error: { message: 'business_unit_id and style_ids[] required' } });
    }

    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();

    const results: { styleId: string; success: boolean; error?: string }[] = [];

    for (const sid of style_ids.slice(0, 100)) { // Limit to 100 at a time
      try {
        await db.updateAiResultStatus(tenantId, buId, sid, '000', 'rejected');
        results.push({ styleId: sid, success: true });
      } catch (err: any) {
        results.push({ styleId: sid, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return res.json({ 
      success: true, 
      data: { 
        processed: results.length, 
        rejected: successCount, 
        failed: results.length - successCount,
        details: results.filter(r => !r.success)
      } 
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/attributes/values/:typeId
 */
router.get('/values/:typeId', asyncHandler(async (req: Request, res: Response) => {
  try {
    const buId = parseInt(req.query.business_unit_id as string, 10);
    if (isNaN(buId)) return res.status(400).json({ success: false });
    const values = await db.getCharacteristicValues(buId, req.params.typeId as string);
    return res.json({ success: true, data: values });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/attributes/rewrite
 * Rewrite product description using AI
 */
router.post('/rewrite', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { business_unit_id, style_id, attributes, tone, current_description } = req.body;
    if (!business_unit_id || !style_id || !attributes) {
      return res.status(400).json({ success: false, error: { message: 'Missing required fields' } });
    }

    const result = await attributesService.rewriteDescription(
      business_unit_id,
      style_id,
      attributes,
      tone,
      current_description
    );

    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Rewrite failed', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/attributes/update
 * Partial update of an AI result (e.g., manual override)
 */
router.post('/update', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { business_unit_id: buId, style_id: sid, type_id: tid, value } = req.body;
    if (!buId || !sid || !tid) return res.status(400).json({ success: false });

    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();

    // 1. Handle Draft Updates
    if (sid.startsWith('DRAFT_')) {
      const sessionId = parseInt(sid.replace('DRAFT_', ''), 10);
      await withConnection(async (conn) => {
        // Special fields mapping
        const fieldMap: Record<string, string> = {
          'VENDOR_ID': 'VENDOR_ID',
          'SIZE_GROUP_ID': 'SIZE_GROUP_ID',
          'SHORT_DESCRIPTION': 'SHORT_DESCRIPTION',
          'LONG_DESCRIPTION': 'LONG_DESCRIPTION'
        };

        if (fieldMap[tid]) {
          await conn.execute(
            `UPDATE STAGING_STYLES SET ${fieldMap[tid]} = :val, UPDATED_AT = CURRENT_TIMESTAMP WHERE SESSION_ID = :sid`,
            { val: value, sid: sessionId }
          );
        } else {
          // Characteristics update for drafts
          await conn.execute(
            `MERGE INTO STAGING_STYLE_CHARACTERISTICS target
             USING (SELECT :sid as s, :tid as t FROM DUAL) source
             ON (target.SESSION_ID = source.s AND target.CHARACTERISTIC_TYPE_ID = source.t)
             WHEN MATCHED THEN UPDATE SET CHARACTERISTIC_VALUE_ID = :val, SOURCE = 'MANUAL'
             WHEN NOT MATCHED THEN INSERT (SESSION_ID, CHARACTERISTIC_TYPE_ID, CHARACTERISTIC_VALUE_ID, SOURCE)
             VALUES (:sid, :tid, :val, 'MANUAL')`,
            { sid: sessionId, tid, val: value }
          );
        }
        await conn.commit();
        
        // Trigger preflight recalculation
        const { onboardingService } = await import('../services/onboarding.service.js');
        await onboardingService.runPreflight(sessionId);
      });
      return res.json({ success: true });
    }

    // 2. Handle Regular Style Updates
    if (tid === 'SHORT_DESCRIPTION') {
      await db.saveAiResult(tenantId, buId, sid, '000', { shortStyleDesc: value, status: 'success' });
    } else if (tid === 'LONG_DESCRIPTION') {
      await db.saveAiResult(tenantId, buId, sid, '000', { longStyleDesc: value, status: 'success' });
    } else {
      const aiRow = await db.getAiResultForAcceptance(tenantId, buId, sid, '000');
      let attrs = aiRow?.ADDITIONAL_ATTRIBUTES ? (typeof aiRow.ADDITIONAL_ATTRIBUTES === 'string' ? JSON.parse(aiRow.ADDITIONAL_ATTRIBUTES) : aiRow.ADDITIONAL_ATTRIBUTES) : [];
      if (!Array.isArray(attrs)) attrs = [];

      const idx = attrs.findIndex((a: any) => a.erpTypeId === tid);
      if (idx > -1) {
        attrs[idx].erpValueDesc = value;
        attrs[idx].erpValueId = 'CUST'; 
      } else {
        attrs.push({ erpTypeId: tid, erpValueDesc: value, erpValueId: 'CUST' });
      }

      await db.saveAiResult(tenantId, buId, sid, '000', { additionalAttributes: attrs, status: 'success' });
    }

    return res.json({ success: true });
  } catch (error: any) {
    logger.error('Update failed', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/attributes/suggestions
 * Get mapping suggestions for an unmapped value
 */
router.post('/suggestions', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { business_unit_id: buId, llm_value: llmValue, type_id: typeId, top_n: topN } = req.body;
    if (!buId || !llmValue) return res.status(400).json({ success: false, error: { message: 'buId and llm_value required' } });

    const suggestions = await attributesService.getSuggestions(buId, llmValue, typeId, topN);
    return res.json({ success: true, data: suggestions });
  } catch (error: any) {
    logger.error('Suggestions failed', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/attributes/config/hierarchy/preview
 * Get impact preview for a hierarchy level
 * NOTE: Must come BEFORE /config/hierarchy to avoid Express route matching issues
 */
router.get('/config/hierarchy/preview', asyncHandler(async (req: Request, res: Response) => {
  try {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();
    const buId = parseInt(req.query.business_unit_id as string, 10);
    const { level_type, level_id } = req.query;
    
    if (!buId || !level_type || !level_id) {
      return res.status(400).json({ success: false, error: { message: 'Missing required parameters' } });
    }
    
    const preview = await new AttributeDefinitionService().getRuleImpactPreview(
      tenantId,
      buId,
      level_type as any,
      level_id as string
    );
    return res.json({ success: true, data: preview });
  } catch (error: any) {
    logger.error('Preview failed', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/attributes/config/hierarchy
 */
router.get('/config/hierarchy', asyncHandler(async (req: Request, res: Response) => {
  try {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();
    const buId = parseInt(req.query.business_unit_id as string, 10);
    const { level_type, level_id, include_children } = req.query;
    if (!buId || !level_type || !level_id) return res.status(400).json({ success: false });
    const rules = await new AttributeDefinitionService().getHierarchyRules(
      tenantId, 
      buId, 
      level_type as any, 
      level_id as string,
      include_children === 'true'
    );
    return res.json({ success: true, data: rules });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/attributes/config/hierarchy
 */
router.post('/config/hierarchy', asyncHandler(async (req: Request, res: Response) => {
  try {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();
    const { businessUnitId, levelType, levelId, characteristicTypeId, isMandatory, applicability, defaultValueId } = req.body;
    if (!businessUnitId || !levelType || !levelId || !characteristicTypeId) return res.status(400).json({ success: false });
    await new AttributeDefinitionService().upsertHierarchyRule(tenantId, { businessUnitId, levelType, levelId, characteristicTypeId, isMandatory, applicability, defaultValueId });
    return res.json({ success: true, message: 'Rule updated' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * DELETE /api/attributes/config/hierarchy/:ruleId
 * Delete a specific hierarchy rule
 */
router.delete('/config/hierarchy/:ruleId', asyncHandler(async (req: Request, res: Response) => {
  try {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();
    const ruleId = parseInt(req.params.ruleId as string, 10);
    if (isNaN(ruleId)) return res.status(400).json({ success: false, error: { message: 'Invalid rule ID' } });
    
    const deleted = await new AttributeDefinitionService().deleteHierarchyRule(tenantId, ruleId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: { message: 'Rule not found' } });
    }
    return res.json({ success: true, message: 'Rule deleted' });
  } catch (error: any) {
    logger.error('Delete rule failed', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/attributes/config/types
 */
router.get('/config/types', asyncHandler(async (req: Request, res: Response) => {
  try {
    const buId = parseInt(req.query.business_unit_id as string, 10);
    if (!buId) return res.status(400).json({ success: false });
    const types = await db.getCharacteristicTypes(buId);
    return res.json({ success: true, data: types });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/attributes/:styleId/:colorId
 * Catch-all parameterized route (MUST BE LAST)
 */
router.get('/:styleId/:colorId', asyncHandler(async (req: Request, res: Response) => {
  try {
    const buId = parseInt(req.query.business_unit_id as string, 10);
    if (isNaN(buId)) return res.status(400).json({ success: false });
    const attributes = await db.getProductAttributes(buId, req.params.styleId as string);
    return res.json({ success: true, data: attributes });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

export default router;
