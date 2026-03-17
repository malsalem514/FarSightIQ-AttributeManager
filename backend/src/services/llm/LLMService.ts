/**
 * LLM Gateway Service (v8.3 - Enterprise Audit Trail)
 * 
 * Orchestrates dual-provider routing, fallback, and observability.
 * Follows strict JSON schema validation and multi-tenant isolation.
 * 
 * v8.3 Enhancements:
 * - Full prompt/response capture for audit trail
 * - Cost and token tracking
 * - Batch progress tracking
 * - Enriched context logging
 */

import { logger } from '../../utils/logger.js';
import { LLMProviderFactory } from './provider-factory.js';
import { type LLMProvider, type ExtractAttributesInput, type AttributeExtractionResult } from './types.js';
import { llmConfigService } from '../llm-config.service.js';
import { withConnection } from '../oracle-pool.js';
import { SettingsService } from '../settings.service.js';
import { z } from 'zod';

// Extraction Schema Validation (Enterprise Hardening)
const extractionResultSchema = z.object({
  styleId: z.string(),
  colorId: z.string(),
  qcPassed: z.boolean(),
  longStyleDesc: z.string(),
  shortStyleDesc: z.string(),
  additionalAttributes: z.record(z.string()),
  confidence: z.string()
}).passthrough();

/**
 * Enhanced run log data for full audit trail
 */
export interface EnrichedRunLog {
  tenantId: string;
  buId: number;
  styleId: string;
  colorId: string;
  taskType: string;
  provider: string;
  model: string;
  latency: number;
  status: 'success' | 'error';
  errorCode?: string;
  output?: string;
  // P0: Audit Trail Fields
  promptText?: string;
  contextJson?: string;
  costUsd?: number;
  tokensInput?: number;
  tokensOutput?: number;
  batchId?: string;
  mappedAttributesJson?: string;
}

export class LLMService {
  private providers: Map<string, LLMProvider> = new Map();

  /**
   * Invalidate provider cache (v9.2)
   */
  public invalidateProviderCache(providerId?: string): void {
    if (providerId) {
      this.providers.delete(providerId.toLowerCase());
      logger.info(`Invalidated LLM provider cache for ${providerId}`);
    } else {
      this.providers.clear();
      logger.info('Invalidated all LLM provider caches');
    }
  }

  /**
   * Get a provider instance, lazily initialized from DB config
   */
  private async getProvider(providerId: string): Promise<LLMProvider> {
    if (this.providers.has(providerId)) return this.providers.get(providerId)!;

    const dbConfig = await llmConfigService.getProviderConfig(providerId);
    if (!dbConfig) throw new Error(`Provider configuration not found: ${providerId}`);

    const provider = LLMProviderFactory.create({
      providerType: providerId as any,
      openaiApiKey: providerId === 'openai' ? dbConfig.API_KEY : undefined,
      openaiModel: providerId === 'openai' ? dbConfig.MODEL_NAME : undefined,
      geminiApiKey: providerId === 'gemini' ? dbConfig.API_KEY : undefined,
      geminiModel: providerId === 'gemini' ? dbConfig.MODEL_NAME : undefined
    });

    this.providers.set(providerId, provider);
    return provider;
  }

  /**
   * Primary entry point for attribute extraction with fallback
   * 
   * @param input - Extraction input with image and context
   * @param batchId - Optional batch ID for correlating batch requests
   */
  async extractAttributes(
    input: ExtractAttributesInput, 
    batchId?: string
  ): Promise<AttributeExtractionResult> {
    const start = Date.now();
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();
    
    // 1. Get routing rule
    const rule = await llmConfigService.getRoutingRule(tenantId, 'extraction');
    const primaryId = rule?.PRIMARY_PROVIDER || 'openai';
    const fallbackId = rule?.FALLBACK_PROVIDER;
    const gate = rule?.CONFIDENCE_GATE || 70;

    let currentProviderId = primaryId;
    let result: AttributeExtractionResult | null = null;
    let error: any = null;

    try {
      // 2. Attempt with Primary Provider
      const provider = await this.getProvider(primaryId);
      result = await provider.extractAttributes(input);
      this.validateResult(result);

      // 3. Check Confidence Gate
      const confidence = parseInt(result.confidence || '0', 10);
      if (confidence < gate && fallbackId) {
        logger.info(`Confidence ${confidence} below gate ${gate}, escalating to fallback`, { styleId: input.styleId });
        throw new Error('LOW_CONFIDENCE');
      }

    } catch (e: any) {
      if (fallbackId) {
        logger.warn(`Primary ${primaryId} failed or low confidence, falling back to ${fallbackId}`, { styleId: input.styleId, error: e.message });
        currentProviderId = fallbackId;
        
        try {
          const fallbackProvider = await this.getProvider(fallbackId);
          result = await fallbackProvider.extractAttributes(input);
          this.validateResult(result);
        } catch (e2: any) {
          error = e2;
          logger.error(`Both providers failed for style ${input.styleId}`, { error: e2.message });
        }
      } else {
        error = e;
      }
    }

    const latency = Date.now() - start;
    
    // 4. Log to AI_MODEL_RUNS with full audit trail (v8.3)
    await this.logRun({
      tenantId,
      buId: input.businessUnitId || 0,
      styleId: input.styleId,
      colorId: input.colorId,
      taskType: 'extraction',
      provider: currentProviderId,
      model: result?.llmMetadata?.model || 'v8-dynamic',
      latency,
      status: result ? 'success' : 'error',
      errorCode: error?.code || error?.message,
      output: result ? JSON.stringify(result) : undefined,
      // P0: Audit Trail (v8.3)
      promptText: result?.promptText,
      contextJson: result?.enrichedContext ? JSON.stringify(result.enrichedContext) : 
                   (input.context ? JSON.stringify(input.context) : undefined),
      costUsd: result?.llmMetadata?.estimatedCostUsd,
      tokensInput: result?.llmMetadata?.tokensInput,
      tokensOutput: result?.llmMetadata?.tokensOutput,
      batchId
    });

    if (!result) throw error || new Error('Extraction failed');
    return result;
  }

  /**
   * Execute a generic prompt (e.g. for mapping)
   */
  async executePrompt(prompt: string, options?: { json?: boolean }): Promise<string | any> {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();
    const rule = await llmConfigService.getRoutingRule(tenantId, 'extraction');
    const providerId = rule?.PRIMARY_PROVIDER || 'openai';

    const provider = await this.getProvider(providerId);
    return provider.executePrompt(prompt, options);
  }

  private validateResult(result: any) {
    const parsed = extractionResultSchema.safeParse(result);
    if (!parsed.success) {
      throw new Error(`Invalid LLM output schema: ${parsed.error.message}`);
    }
  }

  /**
   * Enhanced logging with full audit trail (v8.3)
   */
  async logRun(data: EnrichedRunLog): Promise<void> {
    try {
      await withConnection(async (conn) => {
        await conn.execute(
          `INSERT INTO ATTR_MGR.AI_MODEL_RUNS (
            TENANT_ID, BUSINESS_UNIT_ID, STYLE_ID, COLOR_ID, TASK_TYPE, 
            PROVIDER, MODEL, LATENCY_MS, STATUS, ERROR_CODE, OUTPUT_JSON,
            PROMPT_TEXT, CONTEXT_JSON, COST_USD, TOKENS_INPUT, TOKENS_OUTPUT,
            BATCH_ID, MAPPED_ATTRIBUTES_JSON
          ) VALUES (
            :tenant, :bu, :sid, :cid, :task, :prov, :model, :lat, :status, :err, :out,
            :prompt, :ctx, :cost, :tIn, :tOut, :batch, :mapped
          )`,
          {
            tenant: data.tenantId,
            bu: data.buId,
            sid: data.styleId,
            cid: data.colorId,
            task: data.taskType,
            prov: data.provider,
            model: data.model,
            lat: data.latency,
            status: data.status,
            err: data.errorCode || null,
            out: data.output || null,
            prompt: data.promptText || null,
            ctx: data.contextJson || null,
            cost: data.costUsd || null,
            tIn: data.tokensInput || null,
            tOut: data.tokensOutput || null,
            batch: data.batchId || null,
            mapped: data.mappedAttributesJson || null
          }
        );
        await conn.commit();
      });
    } catch (e: any) {
      logger.error('Failed to log AI model run', { error: e.message });
    }
  }

  /**
   * Update mapped attributes for an existing run (after semantic mapping)
   */
  async updateMappedAttributes(
    tenantId: string, 
    buId: number, 
    styleId: string, 
    mappedAttributes: any[]
  ): Promise<void> {
    try {
      await withConnection(async (conn) => {
        await conn.execute(
          `UPDATE ATTR_MGR.AI_MODEL_RUNS 
           SET MAPPED_ATTRIBUTES_JSON = :mapped
           WHERE TENANT_ID = :tenant 
             AND BUSINESS_UNIT_ID = :bu 
             AND STYLE_ID = :sid 
             AND TASK_TYPE = 'extraction'
             AND ROWNUM = 1
           ORDER BY CREATED_AT DESC`,
          {
            mapped: JSON.stringify(mappedAttributes),
            tenant: tenantId,
            bu: buId,
            sid: styleId
          }
        );
        await conn.commit();
      });
    } catch (e: any) {
      logger.error('Failed to update mapped attributes', { error: e.message });
    }
  }
}

export const llmService = new LLMService();
