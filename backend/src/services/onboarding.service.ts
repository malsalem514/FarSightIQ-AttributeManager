/**
 * Onboarding Service v2
 * 
 * Two-Step Onboarding Flow:
 * 1. Hierarchy Discovery: AI identifies product category from image
 * 2. Attribute Extraction: Using hierarchy context, extract detailed attributes
 * 
 * Features:
 * - Single image onboarding
 * - Bulk image upload (multiple files, ZIP)
 * - Hierarchy-first AI identification
 * - Draft management
 */

import { logger } from '../utils/logger.js';
import { attributesService } from './attributes.service.js';
import { withConnection } from './oracle-pool.js';
import { hierarchyCacheService, HierarchyData, FlatHierarchyItem } from './hierarchy-cache.service.js';
import oracledb from 'oracledb';
import { SettingsService } from './settings.service.js';
import { v4 as uuidv4 } from 'uuid';
import { buildHierarchyDiscoveryPrompt } from '../prompts/hierarchy-discovery.js';
import OpenAI from 'openai';
import { llmConfigService } from './llm-config.service.js';

export interface OnboardingResult {
  sessionId: number;
  workType: 'ONBOARDING' | 'ENRICHMENT';
  draftStatus: string;
  completionPct: number;
  aiSuggestions: any;
  errorLog?: string;
}

export interface BulkOnboardingResult {
  batchId: string;
  totalImages: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
}

export interface HierarchyDiscoveryResult {
  department: { id: string; name: string; confidence: number };
  class: { id: string; name: string; confidence: number };
  subclass?: { id: string; name: string; confidence: number };
  shortDescription?: string;  // AI-generated product title (30 chars)
  primaryColor?: string;      // Detected primary color
  reasoning: string;
  alternativeClassification?: {
    department: string;
    class: string;
    reason: string;
  };
}

export class OnboardingService {
  /**
   * Step 1: Discover hierarchy from image using dedicated AI prompt
   * Uses real retailer taxonomy for accurate classification
   */
  async discoverHierarchy(
    businessUnitId: number,
    imageBase64: string,
    imageName?: string
  ): Promise<HierarchyDiscoveryResult> {
    const settings = await SettingsService.getInstance();
    
    // Get full tenant config with display name and domain (dynamic per tenant)
    const tenantConfig = await settings.getActiveTenantConfig();
    
    logger.info('Discovering hierarchy from image', { 
      tenantId: tenantConfig.id, 
      tenantName: tenantConfig.name,
      tenantDomain: tenantConfig.domain,
      businessUnitId, 
      imageName 
    });

    // Fetch actual hierarchy options from database
    const hierarchyData = await this.fetchHierarchyOptions(businessUnitId);
    
    if (!hierarchyData || hierarchyData.length === 0) {
      logger.warn('No hierarchy data available, using fallback extraction');
      return this.discoverHierarchyFallback(businessUnitId, imageBase64, imageName);
    }
    
    const uniqueDepts = [...new Set(hierarchyData.map(h => h.departmentName))];
    logger.info('Building hierarchy prompt', { 
      totalOptions: hierarchyData.length,
      departments: uniqueDepts.length,
      sampleDepts: uniqueDepts.slice(0, 5)
    });

    // Build valid IDs lookup for validation
    const validDeptIds = new Set(hierarchyData.map(h => h.departmentId));
    const validClassIds = new Set(hierarchyData.filter(h => h.classId).map(h => h.classId));
    const validSubclassIds = new Set(hierarchyData.filter(h => h.subclassId).map(h => h.subclassId));
    
    // Build lookup maps for name-based fallback
    const deptNameToId = new Map<string, string>();
    const classNameToId = new Map<string, string>();
    const subclassNameToId = new Map<string, string>();
    
    for (const h of hierarchyData) {
      if (h.departmentId && h.departmentName) {
        deptNameToId.set(h.departmentName.toLowerCase(), h.departmentId);
      }
      if (h.classId && h.className) {
        classNameToId.set(h.className.toLowerCase(), h.classId);
      }
      if (h.subclassId && h.subclassName) {
        subclassNameToId.set(h.subclassName.toLowerCase(), h.subclassId);
      }
    }

    logger.info('Valid hierarchy IDs for AI prompt', {
      deptCount: validDeptIds.size,
      sampleDeptIds: Array.from(validDeptIds).slice(0, 5),
      classCount: validClassIds.size,
      subclassCount: validSubclassIds.size
    });

    // Build dedicated hierarchy discovery prompt with DYNAMIC tenant info
    const { systemPrompt, userPrompt } = buildHierarchyDiscoveryPrompt({
      retailerName: tenantConfig.name,  // Dynamic: "JD Sports Canada PROD", "Hibbett PROD", etc.
      retailerDomain: tenantConfig.domain || 'fashion retail',  // Dynamic domain
      availableHierarchy: hierarchyData,
      imageName
    });

    // Get active LLM provider with full API key
    const activeConfig = await llmConfigService.getActiveProviderConfig();
    if (!activeConfig?.apiKey) {
      logger.warn('No active LLM API key configured, using fallback');
      return this.discoverHierarchyFallback(businessUnitId, imageBase64, imageName);
    }

    // Call OpenAI directly for hierarchy classification
    const openai = new OpenAI({ apiKey: activeConfig.apiKey });
    const imageDataUrl = `data:image/jpeg;base64,${imageBase64}`;
    const modelName = activeConfig.model || 'gpt-4o-mini';
    const isNewerModel = modelName.startsWith('gpt-5') || modelName.startsWith('o1') || modelName.startsWith('o3');
    
    try {
      // GPT-5 and o-series use max_completion_tokens instead of max_tokens
      const requestParams: any = {
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } }
            ]
          }
        ],
      };
      
      if (isNewerModel) {
        requestParams.max_completion_tokens = 800;
      } else {
        requestParams.max_tokens = 800;
        requestParams.temperature = 0.1;
      }
      
      const completion = await openai.chat.completions.create(requestParams);

      const llmResponse = { content: completion.choices[0]?.message?.content || '' };
      logger.info('Raw AI hierarchy response', { response: llmResponse.content?.substring(0, 500) });

      // Parse response
      let parsed: any;
      let cleanResponse = llmResponse.content || '';
      cleanResponse = cleanResponse.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
      
      try {
        parsed = JSON.parse(cleanResponse);
      } catch (e: any) {
        logger.error('Failed to parse hierarchy JSON', { response: cleanResponse.substring(0, 500), error: e.message });
        throw new Error('Invalid AI response format');
      }

      // VALIDATION: Check if AI returned valid IDs
      const aiDeptId = parsed.department?.id;
      const aiClassName = parsed.class?.name;
      const aiSubclassName = parsed.subclass?.name;
      
      let validatedDeptId = aiDeptId;
      let validatedClassId = parsed.class?.id;
      let validatedSubclassId = parsed.subclass?.id;
      
      // If AI returned an invalid dept ID, try to find by name
      if (aiDeptId && !validDeptIds.has(aiDeptId)) {
        logger.warn('AI returned invalid department ID, attempting name lookup', { 
          aiDeptId, 
          aiDeptName: parsed.department?.name,
          validIds: Array.from(validDeptIds).slice(0, 10)
        });
        
        // Try name-based lookup
        const nameLower = (parsed.department?.name || '').toLowerCase();
        if (deptNameToId.has(nameLower)) {
          validatedDeptId = deptNameToId.get(nameLower)!;
          logger.info('Found department by name', { originalId: aiDeptId, correctedId: validatedDeptId });
        } else {
          // Try partial match
          for (const [name, id] of deptNameToId.entries()) {
            if (nameLower.includes(name) || name.includes(nameLower)) {
              validatedDeptId = id;
              logger.info('Found department by partial name match', { nameLower, matchedName: name, id });
              break;
            }
          }
        }
      }
      
      // Similarly validate class ID
      if (validatedClassId && !validClassIds.has(validatedClassId)) {
        const nameLower = (aiClassName || '').toLowerCase();
        if (classNameToId.has(nameLower)) {
          validatedClassId = classNameToId.get(nameLower)!;
        } else {
          for (const [name, id] of classNameToId.entries()) {
            if (nameLower.includes(name) || name.includes(nameLower)) {
              validatedClassId = id;
              break;
            }
          }
        }
      }
      
      // Validate subclass ID
      if (validatedSubclassId && !validSubclassIds.has(validatedSubclassId)) {
        const nameLower = (aiSubclassName || '').toLowerCase();
        if (subclassNameToId.has(nameLower)) {
          validatedSubclassId = subclassNameToId.get(nameLower)!;
        } else {
          for (const [name, id] of subclassNameToId.entries()) {
            if (nameLower.includes(name) || name.includes(nameLower)) {
              validatedSubclassId = id;
              break;
            }
          }
        }
      }

      logger.info('Validated hierarchy IDs', {
        original: { dept: aiDeptId, class: parsed.class?.id, subclass: parsed.subclass?.id },
        validated: { dept: validatedDeptId, class: validatedClassId, subclass: validatedSubclassId }
      });

      // Extract with VALIDATED IDs (use validated versions, not raw AI output)
      const result: HierarchyDiscoveryResult = {
        department: {
          id: validatedDeptId || 'UNKNOWN',
          name: parsed.department?.name || 'Unknown',
          confidence: parsed.department?.confidence || 0.7
        },
        class: {
          id: validatedClassId || 'UNKNOWN',
          name: parsed.class?.name || 'Unknown',
          confidence: parsed.class?.confidence || 0.65
        },
        subclass: (validatedSubclassId || parsed.subclass?.id) ? {
          id: validatedSubclassId || parsed.subclass.id,
          name: parsed.subclass?.name || 'Unknown',
          confidence: parsed.subclass?.confidence || 0.6
        } : undefined,
        shortDescription: parsed.shortDescription || parsed.short_description || undefined,
        primaryColor: parsed.primaryColor || parsed.primary_color || undefined,
        reasoning: parsed.reasoning || `Classified as ${parsed.department?.name} > ${parsed.class?.name}`,
        alternativeClassification: parsed.alternative_classification || parsed.alternative ? {
          department: parsed.alternative_classification?.department || parsed.alternative?.departmentId,
          class: parsed.alternative_classification?.class || parsed.alternative?.classId,
          reason: parsed.alternative_classification?.reason || parsed.alternative?.reason
        } : undefined
      };

      logger.info('Hierarchy discovered', { 
        department: result.department.name, 
        class: result.class.name, 
        subclass: result.subclass?.name,
        shortDescription: result.shortDescription,
        primaryColor: result.primaryColor,
        confidence: result.department.confidence
      });

      return result;

    } catch (e: any) {
      logger.error('Hierarchy discovery AI call failed', { error: e.message });
      // Fall back to basic extraction
      return this.discoverHierarchyFallback(businessUnitId, imageBase64, imageName);
    }
  }

  /**
   * Fallback: Use basic AI extraction for hierarchy
   */
  private async discoverHierarchyFallback(
    businessUnitId: number,
    imageBase64: string,
    imageName?: string
  ): Promise<HierarchyDiscoveryResult> {
    logger.info('Using fallback hierarchy discovery');
    
    const aiResults = await attributesService.extractBatchWithBase64(businessUnitId, [{
      styleId: 'HIERARCHY_DISCOVERY',
      colorId: '000',
      imageBase64,
      focusedAttributes: ['product_category', 'department', 'class', 'subclass']
    }]);

    const ai = aiResults[0];
    if (!ai || ai.error) {
      throw new Error(`Hierarchy discovery failed: ${ai?.error || 'Unknown error'}`);
    }

    return {
      department: {
        id: ai.departmentId || 'UNKNOWN',
        name: ai.department || ai.aiDepartment || 'Unknown',
        confidence: 0.6
      },
      class: {
        id: ai.categoryId || 'UNKNOWN',
        name: ai.category || ai.aiCategory || 'Unknown',
        confidence: 0.5
      },
      subclass: ai.subCategoryId ? {
        id: ai.subCategoryId,
        name: ai.subCategory || 'Unknown',
        confidence: 0.4
      } : undefined,
      reasoning: 'Used fallback extraction (no hierarchy data)',
      alternativeClassification: undefined
    };
  }

  /**
   * Fetch hierarchy options from HIERARCHY_CACHE
   */
  private async fetchHierarchyOptions(businessUnitId: number): Promise<FlatHierarchyItem[]> {
    return withConnection(async (conn) => {
      const result = await conn.execute(
        `SELECT DISTINCT 
          h.DEPT_ID as DEPARTMENT_ID,
          h.DEPT_NAME as DEPARTMENT_NAME,
          h.CLASS_ID,
          h.CLASS_DESCR as CLASS_NAME,
          h.SUB_CLASS_ID as SUBCLASS_ID,
          h.SUB_CLASS_DESCR as SUBCLASS_NAME
        FROM HIERARCHY_CACHE h
        WHERE h.BUSINESS_UNIT_ID = :buId
        ORDER BY h.DEPT_NAME, h.CLASS_DESCR, h.SUB_CLASS_DESCR`,
        { buId: businessUnitId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      return (result.rows as any[] || []).map(row => ({
        departmentId: row.DEPARTMENT_ID,
        departmentName: row.DEPARTMENT_NAME,
        classId: row.CLASS_ID,
        className: row.CLASS_NAME,
        subclassId: row.SUBCLASS_ID,
        subclassName: row.SUBCLASS_NAME
      }));
    });
  }

  /**
   * Full onboarding: Hierarchy + Attributes in one call
   */
  async startOnboarding(
    businessUnitId: number,
    imageBase64: string,
    imageName: string
  ): Promise<OnboardingResult> {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();

    logger.info('Starting onboarding from photo', { tenantId, businessUnitId, imageName });

    // Step 1: Discover Hierarchy
    let discoveredHierarchy: HierarchyDiscoveryResult;
    try {
      discoveredHierarchy = await this.discoverHierarchy(businessUnitId, imageBase64, imageName);
      logger.info('Hierarchy discovered', { discoveredHierarchy });
    } catch (e: any) {
      logger.warn('Hierarchy discovery failed, falling back to full extraction', { error: e.message });
      // Fallback to original behavior
      return this.startOnboardingLegacy(businessUnitId, imageBase64, imageName);
    }

    // Step 2: Extract attributes with hierarchy context
    const aiResults = await attributesService.extractBatchWithBase64(businessUnitId, [{
      styleId: 'NEW_DRAFT',
      colorId: '000',
      imageBase64,
      focusedAttributes: ['primary_color', 'material', 'pattern', 'silhouette', 'occasion']
    }]);

    const ai = aiResults[0];
    if (!ai || ai.error) {
      throw new Error(`AI Onboarding failed: ${ai?.error || 'Unknown error'}`);
    }

    // Build suggestions with discovered hierarchy - use hierarchy discovery's color/description first
    const suggestions = {
      predictedHierarchy: {
        dept: discoveredHierarchy.department.name,
        deptId: discoveredHierarchy.department.id,
        class: discoveredHierarchy.class.name,
        classId: discoveredHierarchy.class.id,
        subclass: discoveredHierarchy.subclass?.name,
        subclassId: discoveredHierarchy.subclass?.id,
        confidence: {
          department: discoveredHierarchy.department.confidence,
          class: discoveredHierarchy.class.confidence,
          subclass: discoveredHierarchy.subclass?.confidence
        }
      },
      alternativeHierarchy: discoveredHierarchy.alternativeClassification,
      reasoning: discoveredHierarchy.reasoning,
      // Use hierarchy discovery's values first (more specialized prompt), fallback to attribute extraction
      shortDescription: discoveredHierarchy.shortDescription || ai.shortStyleDesc || 'New Product',
      predictedSizeScale: ai.attributes?.find(a => a.erpTypeId === 'SIZE_SCALE')?.llmValue || 'S-M-L',
      predictedColor: discoveredHierarchy.primaryColor || ai.attributes?.find(a => a.erpTypeId === 'COLOR')?.llmValue || ai.colorAiDesc,
      rawAiResponse: ai.rawResponse
    };

    // Save to Staging Tables
    return this.saveToStaging(tenantId, businessUnitId, imageName, imageBase64, suggestions, ai);
  }

  /**
   * Legacy onboarding (without hierarchy-first)
   */
  private async startOnboardingLegacy(
    businessUnitId: number,
    imageBase64: string,
    imageName: string
  ): Promise<OnboardingResult> {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();

    const aiResults = await attributesService.extractBatchWithBase64(businessUnitId, [{
      styleId: 'NEW_DRAFT',
      colorId: '000',
      imageBase64,
      focusedAttributes: ['product_category', 'size_group_prediction', 'primary_color', 'material', 'fabric_type']
    }]);

    const ai = aiResults[0];
    if (!ai || ai.error) {
      throw new Error(`AI Onboarding failed: ${ai?.error || 'Unknown error'}`);
    }

    const suggestions = {
      predictedHierarchy: {
        dept: ai.aiDepartment || ai.department,
        deptId: ai.departmentId,
        class: ai.aiCategory || ai.category,
        classId: ai.categoryId,
        subclass: ai.aiSubCategory || ai.subCategory,
        subclassId: ai.subCategoryId
      },
      predictedSizeScale: ai.attributes?.find(a => a.erpTypeId === 'SIZE_SCALE')?.llmValue || 'S-M-L',
      predictedColor: ai.attributes?.find(a => a.erpTypeId === 'COLOR')?.llmValue || ai.colorAiDesc,
      rawAiResponse: ai.rawResponse
    };

    return this.saveToStaging(tenantId, businessUnitId, imageName, imageBase64, suggestions, ai);
  }

  /**
   * Save onboarding result to staging tables
   * Supports UPSERT: if image name exists, delete old data and create fresh
   */
  private async saveToStaging(
    tenantId: string,
    businessUnitId: number,
    imageName: string,
    imageBase64: string,
    suggestions: any,
    ai: any
  ): Promise<OnboardingResult> {
    return withConnection(async (conn) => {
      // Check if this image already exists
      const existing = await conn.execute(
        `SELECT SESSION_ID FROM STAGING_STYLES WHERE IMAGE_NAME = :imageName`,
        { imageName },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (existing.rows && existing.rows.length > 0) {
        const oldSessionId = (existing.rows[0] as any).SESSION_ID;
        logger.info('Image already exists, overwriting', { imageName, oldSessionId });
        
        // Delete old characteristics
        await conn.execute(
          `DELETE FROM STAGING_STYLE_CHARACTERISTICS WHERE SESSION_ID = :sessionId`,
          { sessionId: oldSessionId }
        );
        
        // Delete old image
        await conn.execute(
          `DELETE FROM STAGING_IMAGES WHERE SESSION_ID = :sessionId`,
          { sessionId: oldSessionId }
        );
        
        // Delete old style record
        await conn.execute(
          `DELETE FROM STAGING_STYLES WHERE SESSION_ID = :sessionId`,
          { sessionId: oldSessionId }
        );
      }

      // Insert Header - use shortDescription from hierarchy discovery (more accurate) or fallback to ai
      const shortDesc = suggestions.shortDescription || ai.shortStyleDesc || 'New Style';
      const result = await conn.execute(
        `INSERT INTO STAGING_STYLES (
          TENANT_ID, BUSINESS_UNIT_ID, WORK_TYPE, 
          IMAGE_NAME, AI_SUGGESTIONS_JSON, 
          SHORT_DESCRIPTION, LONG_DESCRIPTION
        ) VALUES (
          :tenantId, :buId, 'ONBOARDING', 
          :imageName, :suggestions, 
          :shortDesc, :longDesc
        ) RETURNING SESSION_ID INTO :sessionId`,
        {
          tenantId,
          buId: businessUnitId,
          imageName,
          suggestions: JSON.stringify(suggestions),
          shortDesc: shortDesc.substring(0, 30),
          longDesc: ai.longStyleDesc || '',
          sessionId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }
      );

      const sessionId = (result.outBinds as any).sessionId[0];

      // Insert Image BLOB
      await conn.execute(
        `INSERT INTO STAGING_IMAGES (
          IMAGE_NAME, SESSION_ID, BLOB_DATA, CONTENT_TYPE
        ) VALUES (
          :imageName, :sessionId, :blobData, 'image/jpeg'
        )`,
        {
          imageName,
          sessionId,
          blobData: Buffer.from(imageBase64, 'base64')
        }
      );

      // Insert AI-detected characteristics
      if (ai.attributes && ai.attributes.length > 0) {
        const uniqueAttrs = new Map<string, any>();
        for (const attr of ai.attributes) {
          if (attr.erpTypeId && attr.erpValueId) {
            const existing = uniqueAttrs.get(attr.erpTypeId);
            if (!existing || (attr.confidence || 0) > (existing.confidence || 0)) {
              uniqueAttrs.set(attr.erpTypeId, attr);
            }
          }
        }

        for (const attr of uniqueAttrs.values()) {
          await conn.execute(
            `INSERT INTO STAGING_STYLE_CHARACTERISTICS (
              SESSION_ID, CHARACTERISTIC_TYPE_ID, CHARACTERISTIC_VALUE_ID, SOURCE, CONFIDENCE
            ) VALUES (
              :sessionId, :typeId, :valueId, 'AI', :confidence
            )`,
            {
              sessionId,
              typeId: attr.erpTypeId,
              valueId: attr.erpValueId,
              confidence: attr.confidence
            }
          );
        }
      }

      await conn.commit();

      // Run Virtual Preflight
      await this.runPreflight(sessionId);
      
      return this.getDraft(sessionId);
    });
  }

  /**
   * Bulk onboard multiple images
   */
  async startBulkOnboarding(
    businessUnitId: number,
    images: { name: string; buffer: Buffer }[]
  ): Promise<BulkOnboardingResult> {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();
    const batchId = uuidv4();

    logger.info('Starting bulk onboarding', { tenantId, businessUnitId, batchId, imageCount: images.length });

    // Create batch record
    await withConnection(async (conn) => {
      await conn.execute(
        `INSERT INTO ONBOARDING_BATCHES (
          BATCH_ID, TENANT_ID, BUSINESS_UNIT_ID, 
          TOTAL_IMAGES, STATUS, CREATED_AT
        ) VALUES (
          :batchId, :tenantId, :buId, 
          :total, 'queued', CURRENT_TIMESTAMP
        )`,
        { batchId, tenantId, buId: businessUnitId, total: images.length }
      );
      await conn.commit();
    });

    // Process images in background (don't await)
    this.processBulkOnboarding(batchId, businessUnitId, images).catch(err => {
      logger.error('Bulk onboarding failed', { batchId, error: err.message });
    });

    return {
      batchId,
      totalImages: images.length,
      status: 'queued',
      createdAt: new Date()
    };
  }

  /**
   * Process bulk images (runs in background)
   */
  private async processBulkOnboarding(
    batchId: string,
    businessUnitId: number,
    images: { name: string; buffer: Buffer }[]
  ): Promise<void> {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();

    // Update status to PROCESSING
    await withConnection(async (conn) => {
      await conn.execute(
        `UPDATE ONBOARDING_BATCHES SET STATUS = 'processing', STARTED_AT = CURRENT_TIMESTAMP WHERE BATCH_ID = :batchId`,
        { batchId }
      );
      await conn.commit();
    });

    let successCount = 0;
    let errorCount = 0;

    // Process images sequentially (could parallelize later)
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const imageBase64 = image.buffer.toString('base64');

      try {
        // Update current image
        await withConnection(async (conn) => {
          await conn.execute(
            `UPDATE ONBOARDING_BATCHES SET 
              CURRENT_IMAGE = :imageName, 
              PROCESSED_COUNT = :processed 
            WHERE BATCH_ID = :batchId`,
            { batchId, imageName: image.name, processed: i + 1 }
          );
          await conn.commit();
        });

        // Onboard the image
        await this.startOnboarding(businessUnitId, imageBase64, image.name);
        successCount++;
      } catch (err: any) {
        logger.error('Failed to onboard image', { batchId, imageName: image.name, error: err.message });
        errorCount++;

        // Record error
        await withConnection(async (conn) => {
          await conn.execute(
            `INSERT INTO ONBOARDING_BATCH_ERRORS (
              BATCH_ID, IMAGE_NAME, ERROR_MESSAGE, CREATED_AT
            ) VALUES (
              :batchId, :imageName, :error, CURRENT_TIMESTAMP
            )`,
            { batchId, imageName: image.name, error: err.message }
          );
          await conn.commit();
        });
      }
    }

    // Determine final status: COMPLETED if any success, FAILED if all failed
    const finalStatus = successCount > 0 ? 'completed' : 'failed';

    // Update final status
    await withConnection(async (conn) => {
      await conn.execute(
        `UPDATE ONBOARDING_BATCHES SET 
          STATUS = :status, 
          COMPLETED_AT = CURRENT_TIMESTAMP,
          SUCCESS_COUNT = :success,
          ERROR_COUNT = :errors
        WHERE BATCH_ID = :batchId`,
        { batchId, status: finalStatus, success: successCount, errors: errorCount }
      );
      await conn.commit();
    });

    logger.info('Bulk onboarding completed', { batchId, finalStatus, successCount, errorCount });
  }

  /**
   * Get batch status
   */
  async getBatchStatus(batchId: string): Promise<any> {
    return withConnection(async (conn) => {
      const result = await conn.execute(
        `SELECT 
          BATCH_ID, TENANT_ID, BUSINESS_UNIT_ID,
          TOTAL_IMAGES, PROCESSED_COUNT, SUCCESS_COUNT, ERROR_COUNT,
          STATUS, CURRENT_IMAGE, 
          CREATED_AT, STARTED_AT, COMPLETED_AT
        FROM ONBOARDING_BATCHES 
        WHERE BATCH_ID = :batchId`,
        { batchId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!result.rows?.length) {
        throw new Error(`Batch not found: ${batchId}`);
      }

      const batch = result.rows[0] as any;

      // Get errors if any
      const errorsResult = await conn.execute(
        `SELECT IMAGE_NAME, ERROR_MESSAGE, CREATED_AT 
         FROM ONBOARDING_BATCH_ERRORS 
         WHERE BATCH_ID = :batchId 
         ORDER BY CREATED_AT`,
        { batchId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      return {
        ...batch,
        errors: errorsResult.rows || []
      };
    });
  }

  /**
   * Get all drafts for a business unit
   */
  async getDrafts(businessUnitId: number, status?: string): Promise<any[]> {
    return withConnection(async (conn) => {
      let query = `
        SELECT 
          s.SESSION_ID, s.TENANT_ID, s.BUSINESS_UNIT_ID,
          s.WORK_TYPE, s.DRAFT_STATUS, s.COMPLETION_PCT,
          s.IMAGE_NAME, s.SHORT_DESCRIPTION, s.LONG_DESCRIPTION,
          s.AI_SUGGESTIONS_JSON, s.ERROR_LOG,
          s.CREATED_AT, s.UPDATED_AT,
          CASE WHEN i.BLOB_DATA IS NOT NULL THEN 1 
               ELSE 0 END as HAS_IMAGE
        FROM STAGING_STYLES s
        LEFT JOIN STAGING_IMAGES i ON s.IMAGE_NAME = i.IMAGE_NAME
        WHERE s.BUSINESS_UNIT_ID = :buId
      `;
      const binds: any = { buId: businessUnitId };

      if (status) {
        query += ` AND s.DRAFT_STATUS = :status`;
        binds.status = status;
      }

      query += ` ORDER BY s.CREATED_AT DESC`;

      const result = await conn.execute(query, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      return (result.rows || []).map((row: any) => ({
        sessionId: row.SESSION_ID,
        tenantId: row.TENANT_ID,
        businessUnitId: row.BUSINESS_UNIT_ID,
        workType: row.WORK_TYPE,
        status: row.DRAFT_STATUS,
        completionPct: row.COMPLETION_PCT,
        imageName: row.IMAGE_NAME,
        shortDescription: row.SHORT_DESCRIPTION,
        longDescription: row.LONG_DESCRIPTION,
        aiSuggestions: JSON.parse(row.AI_SUGGESTIONS_JSON || '{}'),
        errorLog: row.ERROR_LOG,
        createdAt: row.CREATED_AT,
        updatedAt: row.UPDATED_AT,
        hasImage: row.HAS_IMAGE === 1
      }));
    });
  }

  /**
   * Retrieve a draft with its full details
   */
  async getDraft(sessionId: number): Promise<OnboardingResult> {
    return withConnection(async (conn) => {
      const result = await conn.execute(
        `SELECT 
          SESSION_ID, WORK_TYPE, DRAFT_STATUS, COMPLETION_PCT, 
          AI_SUGGESTIONS_JSON, ERROR_LOG
        FROM STAGING_STYLES 
        WHERE SESSION_ID = :sessionId`,
        { sessionId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const row = (result.rows as any)[0];
      if (!row) throw new Error(`Draft not found: ${sessionId}`);

      return {
        sessionId: row.SESSION_ID,
        workType: row.WORK_TYPE,
        draftStatus: row.DRAFT_STATUS,
        completionPct: row.COMPLETION_PCT,
        aiSuggestions: JSON.parse(row.AI_SUGGESTIONS_JSON || '{}'),
        errorLog: row.ERROR_LOG
      };
    });
  }

  /**
   * Run Virtual Preflight check for a draft
   */
  async runPreflight(sessionId: number): Promise<number> {
    return withConnection(async (conn) => {
      const draftRes = await conn.execute(
        `SELECT * FROM STAGING_STYLES WHERE SESSION_ID = :sessionId`,
        { sessionId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const draft = (draftRes.rows as any)[0];

      let errors = [];
      let weights = {
        hierarchy: 30,
        vendor: 10,
        description: 10,
        size_group: 20,
        colors: 15,
        sizes: 15
      };
      let score = 0;

      if (draft.SECTION_ID) score += weights.hierarchy;
      else errors.push('Hierarchy (Section) is mandatory');

      if (draft.VENDOR_ID) score += weights.vendor;
      else errors.push('Vendor is mandatory');

      if (draft.SHORT_DESCRIPTION) score += weights.description;
      else errors.push('Short Description is mandatory');

      if (draft.SIZE_GROUP_ID) score += weights.size_group;
      else errors.push('Size Group is mandatory');

      const variantRes = await conn.execute(
        `SELECT 
          (SELECT COUNT(*) FROM STAGING_STYLE_COLORS WHERE SESSION_ID = :s1) as color_count,
          (SELECT COUNT(*) FROM STAGING_STYLE_SIZES WHERE SESSION_ID = :s2) as size_count
         FROM DUAL`,
        { s1: sessionId, s2: sessionId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const variants = (variantRes.rows as any)[0];

      if (variants.COLOR_COUNT > 0) score += weights.colors;
      else errors.push('At least one color is required');

      if (variants.SIZE_COUNT > 0) score += weights.sizes;
      else errors.push('At least one size is required');

      const status = score === 100 ? 'READY' : 'DRAFT';
      
      await conn.execute(
        `UPDATE STAGING_STYLES SET 
          COMPLETION_PCT = :score,
          DRAFT_STATUS = :status,
          ERROR_LOG = :errors,
          UPDATED_AT = CURRENT_TIMESTAMP
        WHERE SESSION_ID = :sessionId`,
        {
          score,
          status,
          errors: errors.join('\n'),
          sessionId
        }
      );

      await conn.commit();
      return score;
    });
  }

  /**
   * Update a draft's hierarchy, descriptions, and attributes
   * Note: Only updates columns that exist in the base STAGING_STYLES table
   * Extra data (hierarchy, color, sizeScale) is stored in AI_SUGGESTIONS_JSON
   */
  async updateDraft(sessionId: number, updates: {
    shortDescription?: string;
    longDescription?: string;
    hierarchy?: { deptId?: string; classId?: string; subclassId?: string };
    color?: string;
    sizeScale?: string;
  }): Promise<{ updated: boolean; completionPct: number }> {
    return withConnection(async (conn) => {
      // Only use columns that definitely exist in the base table
      const setClauses: string[] = ['UPDATED_AT = CURRENT_TIMESTAMP'];
      const binds: any = { sessionId };

      if (updates.shortDescription !== undefined) {
        setClauses.push('SHORT_DESCRIPTION = :shortDesc');
        binds.shortDesc = updates.shortDescription;
      }

      if (updates.longDescription !== undefined) {
        setClauses.push('LONG_DESCRIPTION = :longDesc');
        binds.longDesc = updates.longDescription;
      }

      // Store hierarchy, color, sizeScale in AI_SUGGESTIONS_JSON
      // This avoids issues with missing columns in older table versions
      if (updates.hierarchy || updates.color || updates.sizeScale) {
        // First get existing AI suggestions
        const existing = await conn.execute(
          `SELECT AI_SUGGESTIONS_JSON FROM STAGING_STYLES WHERE SESSION_ID = :sessionId`,
          { sessionId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        let suggestions: any = {};
        const row = (existing.rows as any)?.[0];
        if (row?.AI_SUGGESTIONS_JSON) {
          try {
            const clob = row.AI_SUGGESTIONS_JSON;
            const clobData = typeof clob === 'string' ? clob : await clob.getData();
            suggestions = JSON.parse(clobData);
          } catch (e) {
            suggestions = {};
          }
        }

        // Merge updates
        if (updates.hierarchy) {
          suggestions.user_hierarchy = updates.hierarchy;
        }
        if (updates.color !== undefined) {
          suggestions.user_color = updates.color;
        }
        if (updates.sizeScale !== undefined) {
          suggestions.user_size_scale = updates.sizeScale;
        }

        setClauses.push('AI_SUGGESTIONS_JSON = :suggestions');
        binds.suggestions = JSON.stringify(suggestions);
      }

      const sql = `UPDATE STAGING_STYLES SET ${setClauses.join(', ')} WHERE SESSION_ID = :sessionId`;
      await conn.execute(sql, binds);
      await conn.commit();

      // Re-run preflight to update completion status
      const completionPct = await this.runPreflight(sessionId);

      return { updated: true, completionPct };
    });
  }

  /**
   * Get draft image data from STAGING_IMAGES table
   */
  async getDraftImage(sessionId: number): Promise<{ buffer: Buffer; contentType: string } | null> {
    return withConnection(async (conn) => {
      // Get image name from STAGING_STYLES
      const styleResult = await conn.execute(
        `SELECT IMAGE_NAME FROM STAGING_STYLES WHERE SESSION_ID = :sessionId`,
        { sessionId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const styleRow = (styleResult.rows as any)?.[0];
      if (!styleRow?.IMAGE_NAME) {
        return null;
      }

      let imageName = styleRow.IMAGE_NAME.toLowerCase();
      
      // Determine content type from file name
      let contentType = 'image/jpeg';
      if (imageName.endsWith('.png')) contentType = 'image/png';
      else if (imageName.endsWith('.webp')) contentType = 'image/webp';
      else if (imageName.endsWith('.gif')) contentType = 'image/gif';

      // Get image data from STAGING_IMAGES table
      const imgResult = await conn.execute(
        `SELECT BLOB_DATA, CONTENT_TYPE FROM STAGING_IMAGES WHERE IMAGE_NAME = :imageName`,
        { imageName: styleRow.IMAGE_NAME },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const imgRow = (imgResult.rows as any)?.[0];
      if (imgRow?.BLOB_DATA) {
        const lob = imgRow.BLOB_DATA;
        const chunks: Buffer[] = [];
        return new Promise((resolve, reject) => {
          lob.on('data', (chunk: Buffer) => chunks.push(chunk));
          lob.on('end', () => resolve({ 
            buffer: Buffer.concat(chunks), 
            contentType: imgRow.CONTENT_TYPE || contentType 
          }));
          lob.on('error', (err: Error) => reject(err));
        });
      }

      return null;
    });
  }

  /**
   * Delete a draft and its associated image
   */
  async deleteDraft(sessionId: number): Promise<void> {
    return withConnection(async (conn) => {
      // First get the image name to delete the image too
      const styleResult = await conn.execute(
        `SELECT IMAGE_NAME FROM STAGING_STYLES WHERE SESSION_ID = :sessionId`,
        { sessionId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      const imageName = (styleResult.rows as any)?.[0]?.IMAGE_NAME;
      
      // Delete from STAGING_STYLES
      await conn.execute(
        `DELETE FROM STAGING_STYLES WHERE SESSION_ID = :sessionId`,
        { sessionId }
      );

      // Delete associated image from STAGING_IMAGES if exists
      if (imageName) {
        await conn.execute(
          `DELETE FROM STAGING_IMAGES WHERE IMAGE_NAME = :imageName`,
          { imageName }
        );
      }

      await conn.commit();
      logger.info('Draft deleted', { sessionId, imageName });
    });
  }
}

export const onboardingService = new OnboardingService();
