/**
 * Attributes Service (v8.4 - Scalable Parallel Batch Processing)
 * 
 * AI attribute extraction with pluggable LLM providers (OpenAI, Gemini)
 * Includes caching, mapping to ERP values, and audit logging
 * 
 * v8.4 Enhancements:
 * - Parallel batch processing with configurable concurrency
 * - Connection pool aware throttling
 * - Enhanced error resilience for large batches
 * 
 * v8.3 Enhancements:
 * - Batch progress tracking
 * - Enhanced audit trail with mapped attributes
 */

import type { CharValue, MappedAttribute, MappingRule } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { LLMCacheService } from './llm/llm-cache.service.js';
import { LLMProviderFactory, type ProviderType } from './llm/provider-factory.js';
import type { LLMProvider } from './llm/types.js';
import { MappingEngine } from './mapping-engine.js';
import * as attributesDb from './attributes/attributes-db.js';
import { AttributeDefinitionService } from './attributes/attribute-definition.service.js';
import { SettingsService } from './settings.service.js';
import { llmConfigService } from './llm-config.service.js';
import { batchProgressService } from './llm/batch-progress.service.js';
import { llmService } from './llm/LLMService.js';

/**
 * Scalability Configuration (v8.4)
 * 
 * Configuration is loaded from APP_SETTINGS table with env fallback.
 * See llmConfigService.getBatchConfig() for database-backed values.
 * 
 * MAX_CONCURRENT_LLM_REQUESTS: Maximum parallel LLM API calls
 * - OpenAI GPT-4o-mini: Rate limits vary by tier (500-10,000 RPM)
 * - Safe default: 5 concurrent (avoids 429 rate limit errors)
 * - For large batches: Increase to 10-20 if on higher tier
 * 
 * BATCH_CHUNK_SIZE: Items to process before yielding event loop
 * - Prevents blocking other requests during large batches
 */
// Optimized defaults for speed (v8.5)
// - Increased concurrency: GPT-4o-mini rate limits are generous (500-10k RPM depending on tier)
// - With 'low' detail images (85 tokens), we can safely process more in parallel
const DEFAULT_MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_LLM_REQUESTS || '10', 10);
const DEFAULT_CHUNK_SIZE = parseInt(process.env.BATCH_CHUNK_SIZE || '50', 10);

interface BatchResult {
  styleId: string;
  colorId: string;
  
  // Batch tracking (v8.3)
  batchId?: string;
  
  // Database-selected hierarchy (with separate ID fields)
  productCategory?: string;
  productCategoryId?: string;
  department?: string;
  departmentId?: string;
  category?: string;
  categoryId?: string;
  subCategory?: string;
  subCategoryId?: string;
  
  // AI-generated hierarchy (free-form)
  aiProductCategory?: string;
  aiDepartment?: string;
  aiCategory?: string;
  aiSubCategory?: string;
  aiBrandDesc?: string;
  
  // Hierarchy confidence (per-level)
  hierarchyConfidence?: {
    productCategory?: string;
    department?: string;
    category?: string;
    subCategory?: string;
  };
  
  // Descriptions and attributes
  brand?: string;
  longStyleDesc?: string;
  shortStyleDesc?: string;
  colorAiDesc?: string;
  attributes?: MappedAttribute[];
  
  // Metadata
  confidence?: string;
  processingTimeMs?: number;
  rawResponse?: string;
  error?: string;
}

export type { ProductAttribute } from './attributes/attributes-db.js';

/**
 * Attributes Service
 * 
 * Features:
 * - Dynamic LLM providers from database (OpenAI, Gemini)
 * - 30-day response caching
 * - Semantic mapping to ERP values
 * - Audit logging
 */
export class AttributesService {
  private cache?: LLMCacheService;

  constructor(config: { cacheEnabled?: boolean; cacheTtlSeconds?: number }) {
    // Initialize cache (if enabled)
    if (config.cacheEnabled !== false) {
      this.cache = new LLMCacheService(config.cacheTtlSeconds);
    }

    logger.info('AttributesService initialized', {
      cacheEnabled: !!this.cache,
    });
  }

  /**
   * Get provider instance based on active DB config
   */
  private async getProvider(): Promise<LLMProvider> {
    const activeConfig = await llmConfigService.getActiveConfigInternal();
    
    if (!activeConfig) {
      // Fallback to env if DB is empty
      return LLMProviderFactory.create({
        providerType: config.llm.provider as any,
        openaiApiKey: config.llm.openaiApiKey,
        openaiModel: config.llm.openaiModel,
        geminiApiKey: config.llm.geminiApiKey,
        geminiModel: config.llm.geminiModel,
      });
    }

    return LLMProviderFactory.create({
      providerType: activeConfig.PROVIDER_ID.toLowerCase() as any,
      openaiApiKey: activeConfig.PROVIDER_ID === 'openai' ? activeConfig.API_KEY : undefined,
      openaiModel: activeConfig.PROVIDER_ID === 'openai' ? activeConfig.MODEL_NAME : undefined,
      openaiTemperature: activeConfig.TEMPERATURE,
      geminiApiKey: activeConfig.PROVIDER_ID === 'gemini' ? activeConfig.API_KEY : undefined,
      geminiModel: activeConfig.PROVIDER_ID === 'gemini' ? activeConfig.MODEL_NAME : undefined,
      geminiTemperature: activeConfig.TEMPERATURE,
    });
  }

  /**
   * Extract attributes from base64 image (single)
   */
  async extractFromBase64(businessUnitId: number, imageBase64: string): Promise<MappedAttribute[]> {
    const results = await this.extractBatchWithBase64(businessUnitId, [{
      styleId: 'single',
      colorId: '000',
      imageBase64
    }]);
    return results[0]?.attributes || [];
  }

  /**
   * Process batch with base64 images directly (v8.4 - Parallel Processing)
   * 
   * Performance optimizations:
   * - Parallel processing with configurable concurrency (from APP_SETTINGS table)
   * - Semaphore pattern to prevent overwhelming OpenAI rate limits
   * - Atomic progress updates for real-time tracking
   * - Error isolation (one failure doesn't stop the batch)
   */
  async extractBatchWithBase64(
    businessUnitId: number,
    images: Array<{ styleId: string; colorId: string; imageBase64: string; focusedAttributes?: string[] }>
  ): Promise<BatchResult[]> {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();
    const provider = await this.getProvider();
    
    // Load batch config from database (with cache)
    const batchConfig = await llmConfigService.getBatchConfig();
    
    const startTime = Date.now();
    const concurrency = Math.min(batchConfig.maxConcurrentRequests || DEFAULT_MAX_CONCURRENT, images.length);
    
    logger.info('Starting parallel batch extraction', {
      tenantId,
      businessUnitId,
      totalItems: images.length,
      concurrency,
      estimatedTimeMin: Math.ceil((images.length / concurrency) * 10 / 60) // ~10s per item
    });

    // v8.3: Create batch progress record for tracking
    let batchId: string | undefined;
    if (images.length > 1) {
      try {
        batchId = await batchProgressService.createBatch(tenantId, businessUnitId, images.length);
        logger.info('Batch created', { batchId, totalItems: images.length });
      } catch (e: any) {
        logger.warn('Failed to create batch progress, continuing without', { error: e.message });
      }
    }

    // Semaphore for concurrency control (p-limit pattern without dependency)
    let activeCount = 0;
    const queue: Array<() => void> = [];
    
    const acquire = (): Promise<void> => {
      return new Promise(resolve => {
        if (activeCount < concurrency) {
          activeCount++;
          resolve();
        } else {
          queue.push(resolve);
        }
      });
    };
    
    const release = () => {
      activeCount--;
      if (queue.length > 0) {
        activeCount++;
        const next = queue.shift()!;
        next();
      }
    };

    // Process single item (isolated error handling)
    const processItem = async (img: typeof images[0], index: number): Promise<BatchResult> => {
      await acquire();
      
      try {
        // Check cache first
        let result = this.cache?.get(img.imageBase64);
        let fromCache = !!result;

        if (!result) {
          result = await provider.extractAttributes({
            imageBase64: img.imageBase64,
            styleId: img.styleId,
            colorId: img.colorId,
            businessUnitId,
            focusedAttributes: img.focusedAttributes
          });

          if (this.cache && result.qcPassed) {
            this.cache.set(img.imageBase64, result);
          }
        }

        // Map additional_attributes to ERP values, preserving per-attribute confidence
        let mappedAttrs: MappedAttribute[] = [];
        if (result.additionalAttributes && Object.keys(result.additionalAttributes).length > 0) {
          // Normalize: LLM returns { value, confidence } pairs (Zod schema now preserves confidence)
          const normalizedAttrs: Record<string, { value: string; confidence: number }> = {};
          for (const [key, val] of Object.entries(result.additionalAttributes)) {
            if (typeof val === 'string') {
              normalizedAttrs[key] = { value: val, confidence: 50 }; // Default 50%
            } else if (val && typeof val === 'object' && 'value' in val) {
              const obj = val as { value?: string; confidence?: number };
              normalizedAttrs[key] = {
                value: String(obj.value || ''),
                confidence: typeof obj.confidence === 'number' ? obj.confidence : 50
              };
            } else if (val !== null && val !== undefined) {
              normalizedAttrs[key] = { value: String(val), confidence: 50 };
            }
          }
          
          mappedAttrs = await this.mapToErpWithConfidence(tenantId, businessUnitId, normalizedAttrs, {
            deptId: result.departmentId,
            classId: result.categoryId,
            subclassId: result.subCategoryId,
            styleId: result.styleId
          });
          
          // v8.3: Update AI_MODEL_RUNS with mapped attributes
          if (mappedAttrs.length > 0) {
            llmService.updateMappedAttributes(tenantId, businessUnitId, result.styleId, mappedAttrs)
              .catch(err => logger.warn('Failed to update mapped attrs in audit', { error: err.message }));
          }
        }

        const batchResult: BatchResult = {
          styleId: result.styleId,
          colorId: result.colorId,
          batchId,
          productCategory: result.productCategory,
          productCategoryId: result.productCategoryId,
          department: result.department,
          departmentId: result.departmentId,
          category: result.category,
          categoryId: result.categoryId,
          subCategory: result.subCategory,
          subCategoryId: result.subCategoryId,
          aiProductCategory: result.aiProductCategory,
          aiDepartment: result.aiDepartment,
          aiCategory: result.aiCategory,
          aiSubCategory: result.aiSubCategory,
          aiBrandDesc: result.aiBrandDesc,
          hierarchyConfidence: result.hierarchyConfidence,
          brand: result.brand,
          longStyleDesc: result.longStyleDesc,
          shortStyleDesc: result.shortStyleDesc,
          colorAiDesc: result.colorAiDesc,
          attributes: mappedAttrs,
          confidence: result.confidence,
          processingTimeMs: result.processingTimeMs,
          rawResponse: result.rawResponse,
        };

        // Persist results to database (Tenant-aware) - fire and forget
        attributesDb.saveAiResult(tenantId, businessUnitId, result.styleId, result.colorId, {
          longStyleDesc: result.longStyleDesc,
          shortStyleDesc: result.shortStyleDesc,
          colorAiDesc: result.colorAiDesc,
          additionalAttributes: mappedAttrs,
          llmMetadata: {
            overall_confidence: parseInt(result.confidence || '0', 10),
            processing_time_ms: result.processingTimeMs,
            model: result.llmMetadata?.model || 'GPT-4o-Mini',
            cost_usd: result.llmMetadata?.estimatedCostUsd,
            tokens_input: result.llmMetadata?.tokensInput,
            tokens_output: result.llmMetadata?.tokensOutput
          },
          status: 'success'
        }).catch(err => logger.error('Failed to persist AI result', { tenantId, styleId: result.styleId, error: err.message }));
        
        // v8.3: Log to AI_MODEL_RUNS for audit trail - fire and forget
        llmService.logRun({
          tenantId,
          buId: businessUnitId,
          styleId: result.styleId,
          colorId: result.colorId,
          taskType: 'extraction',
          provider: 'openai',
          model: result.llmMetadata?.model || 'gpt-4o-mini',
          latency: result.processingTimeMs || 0,
          status: 'success',
          output: result.rawResponse,
          promptText: result.promptText,
          contextJson: result.enrichedContext ? JSON.stringify(result.enrichedContext) : undefined,
          costUsd: result.llmMetadata?.estimatedCostUsd,
          tokensInput: result.llmMetadata?.tokensInput,
          tokensOutput: result.llmMetadata?.tokensOutput,
          batchId,
          mappedAttributesJson: mappedAttrs.length > 0 ? JSON.stringify(mappedAttrs) : undefined
        }).catch(err => logger.warn('Failed to log AI run', { error: err.message }));

        // v8.3: Update batch progress
        if (batchId) {
          batchProgressService.updateProgress(batchId, true, img.styleId)
            .catch(err => logger.warn('Failed to update batch progress', { error: err.message }));
        }

        logger.info('Extraction complete', {
          tenantId,
          styleId: result.styleId,
          fromCache,
          qcPassed: result.qcPassed,
          attributeCount: mappedAttrs.length,
          batchId,
          itemIndex: index + 1,
          totalItems: images.length
        });

        return batchResult;

      } catch (error: any) {
        logger.error('Extraction failed', {
          tenantId,
          styleId: img.styleId,
          error: error.message,
          batchId,
          itemIndex: index + 1
        });

        // v8.3: Update batch progress even on failure
        if (batchId) {
          batchProgressService.updateProgress(batchId, false, img.styleId)
            .catch(err => logger.warn('Failed to update batch progress', { error: err.message }));
        }

        return {
          styleId: img.styleId,
          colorId: img.colorId,
          batchId,
          rawResponse: JSON.stringify({ error: error.message, timestamp: new Date().toISOString() }),
          error: error.message,
        };
      } finally {
        release();
      }
    };

    // Process all items in parallel with concurrency limit
    const results = await Promise.all(images.map((img, index) => processItem(img, index)));

    // v8.3: Mark batch as completed
    if (batchId) {
      const errorCount = results.filter(r => r.error).length;
      const finalStatus = errorCount > 0 && errorCount === results.length ? 'ERROR' : 'COMPLETED';
      batchProgressService.completeBatch(batchId, finalStatus)
        .catch(err => logger.warn('Failed to complete batch', { error: err.message }));
    }

    const totalTimeMs = Date.now() - startTime;
    const avgTimePerItem = Math.round(totalTimeMs / images.length);
    const throughput = Math.round((images.length / totalTimeMs) * 1000 * 60); // items per minute
    
    logger.info('Batch extraction completed', {
      tenantId,
      businessUnitId,
      batchId,
      totalItems: images.length,
      successCount: results.filter(r => !r.error).length,
      errorCount: results.filter(r => r.error).length,
      totalTimeMs,
      avgTimePerItemMs: avgTimePerItem,
      throughputPerMinute: throughput,
      concurrencyUsed: concurrency
    });

    return results;
  }

  /**
   * Get current attributes for a product from Oracle
   */
  async getProductAttributes(
    businessUnitId: number,
    styleId: string,
    colorId: string
  ) {
    return attributesDb.getProductAttributes(businessUnitId, styleId, colorId);
  }

  /**
   * Map raw AI attributes to ERP values using MappingEngine
   */
  private async mapToErp(
    tenantId: string,
    businessUnitId: number,
    rawAttrs: Record<string, string>,
    context?: { deptId?: string; classId?: string; subclassId?: string; styleId?: string }
  ): Promise<MappedAttribute[]> {
    // 1. Fetch effective rules for this context (Magic: Hierarchy-Aware)
    let allowedTypeIds: Set<string> | undefined;
    let effectiveRules: any[] = [];

    if (context && (context.deptId || context.classId || context.subclassId)) {
      try {
        const definitionService = new AttributeDefinitionService();
        effectiveRules = await definitionService.getEffectiveRules(
          tenantId,
          businessUnitId,
          context.deptId || '',
          context.classId || '',
          context.subclassId || '',
          context.styleId
        );
        if (effectiveRules.length > 0) {
          allowedTypeIds = new Set(effectiveRules.map(r => r.characteristicTypeId));
        }
      } catch (err) {
        logger.warn('Failed to fetch hierarchy rules for mapping context', { tenantId, context, error: (err as Error).message });
      }
    }

    // 2. Load mapping rules and char values (delegated to DB layer)
    const [rules, charValues] = await Promise.all([
      attributesDb.loadMappingRules(tenantId, businessUnitId),
      attributesDb.loadCharValues(businessUnitId)
    ]);

    const engine = new MappingEngine(rules, charValues);
    const mapped = await engine.mapAll(rawAttrs, allowedTypeIds);

    // 3. Mark which ones are mandatory based on rules
    if (effectiveRules.length > 0) {
      for (const attr of mapped) {
        const rule = effectiveRules.find(r => r.characteristicTypeId === attr.erpTypeId);
        if (rule) {
          attr.isRequired = rule.isMandatory;
        }
      }
    }

    return mapped;
  }

  /**
   * Map raw AI attributes to ERP values, preserving per-attribute confidence from LLM
   */
  private async mapToErpWithConfidence(
    tenantId: string,
    businessUnitId: number,
    rawAttrs: Record<string, { value: string; confidence: number }>,
    context?: { deptId?: string; classId?: string; subclassId?: string; styleId?: string }
  ): Promise<MappedAttribute[]> {
    // 1. Fetch effective rules for this context (Hierarchy-Aware)
    let allowedTypeIds: Set<string> | undefined;
    let effectiveRules: any[] = [];

    if (context && (context.deptId || context.classId || context.subclassId)) {
      try {
        const definitionService = new AttributeDefinitionService();
        effectiveRules = await definitionService.getEffectiveRules(
          tenantId,
          businessUnitId,
          context.deptId || '',
          context.classId || '',
          context.subclassId || '',
          context.styleId
        );
        if (effectiveRules.length > 0) {
          allowedTypeIds = new Set(effectiveRules.map(r => r.characteristicTypeId));
        }
      } catch (err) {
        logger.warn('Failed to fetch hierarchy rules for mapping context', { tenantId, context, error: (err as Error).message });
      }
    }

    // 2. Load mapping rules and char values
    const [rules, charValues] = await Promise.all([
      attributesDb.loadMappingRules(tenantId, businessUnitId),
      attributesDb.loadCharValues(businessUnitId)
    ]);

    const engine = new MappingEngine(rules, charValues);
    
    // 3. Map with AI confidence preserved
    const mapped = await engine.mapAllWithConfidence(rawAttrs, allowedTypeIds);

    // 4. Mark which ones are mandatory based on rules
    if (effectiveRules.length > 0) {
      for (const attr of mapped) {
        const rule = effectiveRules.find(r => r.characteristicTypeId === attr.erpTypeId);
        if (rule) {
          attr.isRequired = rule.isMandatory;
        }
      }
    }

    return mapped;
  }

  /**
   * Get mapping suggestions for an unmapped LLM value
   */
  async getSuggestions(
    businessUnitId: number,
    llmValue: string,
    typeId?: string,
    topN = 5
  ): Promise<Array<{ typeId: string; valueId: string; valueDesc: string; confidence: number }>> {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();

    const [rules, charValues] = await Promise.all([
      attributesDb.loadMappingRules(tenantId, businessUnitId),
      attributesDb.loadCharValues(businessUnitId)
    ]);

    const engine = new MappingEngine(rules, charValues);
    return engine.getSuggestions(llmValue, typeId, topN);
  }

  /**
   * Get cache statistics (if caching enabled)
   */
  getCacheStats() {
    return this.cache?.getStats() || { hits: 0, misses: 0, hitRate: 0, keys: 0 };
  }

  /**
   * Health check (verify provider is working)
   */
  async healthCheck(): Promise<boolean> {
    const provider = await this.getProvider();
    return provider.healthCheck();
  }

  /**
   * Rewrite product description using AI
   */
  async rewriteDescription(
    businessUnitId: number,
    styleId: string,
    attributes: Record<string, string>,
    tone: 'professional' | 'engaging' | 'seo' | 'concise' = 'professional',
    currentDescription?: string
  ) {
    const provider = await this.getProvider();
    if (!provider.rewriteDescription) {
      throw new Error(`Provider ${provider.name} does not support description rewriting`);
    }

    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();

    const result = await provider.rewriteDescription({
      styleId,
      attributes,
      tone,
      currentDescription
    });

    // Save to DB if successful (Tenant-aware)
    await attributesDb.saveAiResult(tenantId, businessUnitId, styleId, '000', {
      shortStyleDesc: result.shortDescription,
      longStyleDesc: result.longDescription,
      status: 'success'
    }).catch(err => logger.error('Failed to save rewritten description', { tenantId, styleId, error: err.message }));

    return result;
  }

  // ============================================================
  // Backward Compatibility Methods (for v1 routes)
  // ============================================================

  /**
   * Extract attributes from image URL (backward compatible)
   * Downloads image and converts to base64 before extraction
   */
  async extractFromImage(businessUnitId: number, imageUrl: string): Promise<MappedAttribute[]> {
    // Download image and convert to base64
    const axios = (await import('axios')).default;
    
    // Resolve relative URLs to absolute
    const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || `http://localhost:${process.env.PORT || '3002'}`;
    let resolvedUrl = imageUrl;
    if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('data:')) {
      resolvedUrl = `${BACKEND_BASE_URL}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
    }
    
    const response = await axios.get(resolvedUrl, { 
      responseType: 'arraybuffer',
      timeout: 30000
    });
    const imageBase64 = Buffer.from(response.data).toString('base64');
    
    return this.extractFromBase64(businessUnitId, imageBase64);
  }

  /**
   * Extract attributes from batch (backward compatible)
   * Handles both image URLs and base64
   * v8.4.1: Auto-constructs image URLs from style_id if not provided
   */
  async extractBatch(
    businessUnitId: number,
    images: Array<{ styleId: string; colorId: string; imageUrl?: string; imageBase64?: string; focusedAttributes?: string[] }>
  ): Promise<BatchResult[]> {
    // Convert image URLs to base64 if needed
    const axios = (await import('axios')).default;
    
    // Resolve relative URLs to absolute (backend runs on localhost:3002)
    const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || `http://localhost:${process.env.PORT || '3002'}`;
    
    const resolveImageUrl = (url: string, styleId?: string): string => {
      // v8.4.1: Auto-construct URL from style_id if no URL provided
      if (!url && styleId) {
        return `${BACKEND_BASE_URL}/api/images/${styleId}.jpg`;
      }
      if (!url) return url;
      // If already absolute, return as-is
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
        return url;
      }
      // Convert relative to absolute
      return `${BACKEND_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
    };
    
    const imagesWithBase64 = await Promise.all(
      images.map(async (img) => {
        if (img.imageBase64) {
          return { ...img };
        }
        
        // v8.4.1: Auto-construct URL from style_id if no image_url provided
        const effectiveUrl = img.imageUrl || '';
        const resolvedUrl = resolveImageUrl(effectiveUrl, img.styleId);
        
        if (resolvedUrl) {
          try {
            logger.debug('Fetching image', { 
              styleId: img.styleId,
              originalUrl: effectiveUrl || '(auto-constructed)', 
              resolvedUrl 
            });
            // Optimized: Reduced timeout from 30s to 15s for faster batch failures
            const response = await axios.get(resolvedUrl, { 
              responseType: 'arraybuffer',
              timeout: 15000 // 15 second timeout - fail fast for slow images
            });
            const imageBase64 = Buffer.from(response.data).toString('base64');
            const sizeKb = Math.round(response.data.length / 1024);
            logger.info('Image fetched successfully', { 
              styleId: img.styleId, 
              sizeKb 
            });
            // Note: Images > 500KB could be resized server-side for faster processing
            // OpenAI's 'low' detail mode doesn't need high resolution anyway
            if (sizeKb > 500) {
              logger.warn('Large image may slow processing', { styleId: img.styleId, sizeKb });
            }
            return { ...img, imageBase64, imageUrl: resolvedUrl };
          } catch (error: any) {
            logger.error('Failed to download image', { 
              styleId: img.styleId,
              imageUrl: effectiveUrl || '(auto-constructed)', 
              resolvedUrl, 
              error: error.message 
            });
            return { ...img, imageBase64: '' };
          }
        }
        return img;
      })
    );

    return this.extractBatchWithBase64(businessUnitId, imagesWithBase64 as any);
  }
}

// Singleton instance (Magic Unified Workflow)
import { config } from '../config.js';

export const attributesService = new AttributesService({
  cacheEnabled: config.llm.cacheEnabled,
  cacheTtlSeconds: config.llm.cacheTtlSeconds,
});

