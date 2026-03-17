/**
 * OpenAI Provider (v8.3 - Enhanced with Audit Trail)
 * 
 * Native OpenAI integration using official SDK with hierarchy classification support.
 * 
 * Key features:
 * - Official OpenAI SDK (vanilla, no abstractions)
 * - Vision API (gpt-4o-mini)
 * - Hierarchy classification (database-selected from cache)
 * - Dual hierarchy (database + AI-generated)
 * - Token tracking + cost calculation
 * - Parses "ID:Description" format into separate fields
 * - v8.3: Full prompt capture for audit trail
 * - v8.3: Enriched context support
 */

import OpenAI from 'openai';
import { AttributeExtractionSchema } from '../../schemas/llm-attributes.schema.js';
import { SYSTEM_PROMPT, buildUserPrompt, buildEnrichedUserPrompt } from '../../prompts/attribute-extraction.js';
import { buildSystemPrompt as buildSystemPromptV2, buildUserPrompt as buildUserPromptV2, type FullProductContext } from '../../prompts/attribute-extraction-v2.js';
import { REWRITE_SYSTEM_PROMPT, buildRewritePrompt } from '../../prompts/description-rewrite.js';
import { hierarchyCacheService } from '../hierarchy-cache.service.js';
import { enrichedContextService } from './enriched-context.service.js';
import { SettingsService } from '../settings.service.js';
import { logger } from '../../utils/logger.js';
import type { 
  LLMProvider, 
  ExtractAttributesInput, 
  AttributeExtractionResult,
  RewriteDescriptionInput,
  RewriteDescriptionResult
} from './types.js';

/**
 * OpenAI Provider Configuration
 */
export interface OpenAIProviderConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * OpenAI LLM Provider with Hierarchy Classification
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  
  private openai: OpenAI;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private imageDetail: 'auto' | 'low' | 'high';

  constructor(config: OpenAIProviderConfig) {
    this.openai = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || 'gpt-4o-mini';
    this.temperature = config.temperature ?? 0.2;
    // Optimized: Reduced from 2000 - typical responses are 500-800 tokens
    this.maxTokens = config.maxTokens || 1200;
    // Optimized: 'low' uses 85 fixed tokens vs 765+ for 'auto'
    // Product images don't need high resolution for attribute extraction
    this.imageDetail = 'low';
  }

  /**
   * Extract attributes from product image with hierarchy classification.
   * 
   * Workflow:
   * 1. Detect new vs existing product (all hierarchy fields empty = new)
   * 2. Load hierarchy options from cache (for new products only)
   * 3. Pass hierarchy options to LLM prompt
   * 4. LLM selects from options: "504:Childrens"
   * 5. Parse "ID:Description" into separate fields
   * 6. Return structured result with separate ID fields
   */
  async extractAttributes(input: ExtractAttributesInput): Promise<AttributeExtractionResult> {
    const startTime = Date.now();

    try {
      // ===== STEP 1: Detect New vs Existing Product =====
      const isNewProduct = this.isNewProduct(input.context);
      
      logger.info('Extracting attributes', {
        styleId: input.styleId,
        colorId: input.colorId,
        businessUnitId: input.businessUnitId,
        isNewProduct,
      });

      // ===== STEP 2: Load Hierarchy Options (for new products only) =====
      let hierarchyOptions;
      if (isNewProduct && input.businessUnitId) {
        try {
          hierarchyOptions = await hierarchyCacheService.getCache(input.businessUnitId);
          
          const hasOptions = Object.keys(hierarchyOptions.groups).length > 0;
          logger.info('Hierarchy options loaded', {
            businessUnitId: input.businessUnitId,
            hasOptions,
            groups: Object.keys(hierarchyOptions.groups).length,
            departments: Object.keys(hierarchyOptions.departments).length,
            classes: Object.keys(hierarchyOptions.classes).length,
            subclasses: Object.keys(hierarchyOptions.subclasses).length,
          });
          
          if (!hasOptions) {
            logger.warn('Hierarchy cache is empty or expired', {
              businessUnitId: input.businessUnitId,
              message: 'LLM will use "N/A" for hierarchy fields',
            });
          }
        } catch (error: any) {
          logger.error('Failed to load hierarchy options', {
            businessUnitId: input.businessUnitId,
            error: error.message,
            fallback: 'Proceeding without hierarchy options',
          });
          hierarchyOptions = undefined;
        }
      } else {
        logger.info('Skipping hierarchy lookup', {
          reason: isNewProduct ? 'No business_unit_id provided' : 'Existing product (has DB classification)',
        });
      }

      // ===== STEP 3: Build FULL Enriched Context (v2 Enhanced Prompts) =====
      let fullContext: FullProductContext | null = null;
      let enrichedContext = null;
      let useV2Prompts = false;
      
      if (input.businessUnitId && input.styleId) {
        try {
          // Use v2 full context for maximum prompt quality
          fullContext = await enrichedContextService.buildFullContext(
            input.businessUnitId,
            input.styleId,
            input.colorId
          );
          useV2Prompts = true;
          
          logger.debug('Full context built (v2)', { 
            styleId: input.styleId, 
            hasErpAttrs: fullContext.existingAttributes.length,
            mandatoryCount: fullContext.mandatoryRules.length,
            optionalCount: fullContext.optionalRules.length,
            validValuesCount: Object.keys(fullContext.validValues || {}).length,
            hasPricing: !!fullContext.product.msrp || !!fullContext.product.ticketPrice
          });
        } catch (e: any) {
          logger.warn('Failed to build full context, falling back to v1', { 
            styleId: input.styleId, 
            error: e.message 
          });
          // Fall back to legacy enriched context
          try {
            enrichedContext = await enrichedContextService.buildContext(
              input.businessUnitId,
              input.styleId,
              input.colorId
            );
          } catch {}
        }
      }

      // ===== STEP 4: Build Prompt with v2 or v1 System =====
      let systemPrompt: string;
      let userPrompt: string;
      
      if (useV2Prompts && fullContext) {
        // V2: Retailer-aware system prompt + full context user prompt
        const settings = await SettingsService.getInstance();
        const tenantId = await settings.getActiveTenantId();
        
        fullContext.hierarchyOptions = hierarchyOptions;
        fullContext.focusedAttributes = input.focusedAttributes;
        
        systemPrompt = buildSystemPromptV2(tenantId);
        userPrompt = buildUserPromptV2(fullContext);
        
        logger.info('Using v2 enhanced prompts', { tenantId, styleId: input.styleId });
      } else if (enrichedContext) {
        // V1: Legacy enriched context
        const enrichedContextText = enrichedContextService.formatForPrompt(enrichedContext);
        systemPrompt = SYSTEM_PROMPT;
        userPrompt = buildEnrichedUserPrompt(enrichedContextText, hierarchyOptions, input.focusedAttributes);
      } else {
        // V0: Basic context only
        systemPrompt = SYSTEM_PROMPT;
        userPrompt = buildUserPrompt(input.context, hierarchyOptions, input.focusedAttributes);
      }

      // Build messages
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${input.imageBase64}`,
                // Optimized: 'low' = 85 tokens, 'auto/high' = 765+ tokens per image
                // Product images don't need high resolution for attribute extraction
                detail: this.imageDetail,
              },
            },
          ],
        },
      ];

      // Capture full prompt for audit (v8.3)
      const fullPromptText = `[SYSTEM]\n${systemPrompt}\n\n[USER]\n${userPrompt}`;

      // ===== STEP 4: Call OpenAI with JSON Mode =====
      // GPT-5 and o-series models use max_completion_tokens instead of max_tokens
      const isNewerModel = this.model.startsWith('gpt-5') || this.model.startsWith('o1') || this.model.startsWith('o3');
      
      const requestParams: any = {
        model: this.model,
        messages,
        response_format: { type: 'json_object' }, // Forces valid JSON
      };
      
      if (isNewerModel) {
        requestParams.max_completion_tokens = this.maxTokens;
      } else {
        requestParams.temperature = this.temperature;
        requestParams.max_tokens = this.maxTokens;
      }
      
      const response = await this.openai.chat.completions.create(requestParams);

      const processingTimeMs = Date.now() - startTime;
      const usage = response.usage;
      const content = response.choices[0]?.message?.content;

      if (!content) {
        logger.error('Empty OpenAI response', { response: JSON.stringify(response, null, 2) });
        throw new Error('Empty LLM response');
      }

      // ===== STEP 5: Parse and Validate Response =====
      const parsed = JSON.parse(content);
      logger.info('Raw OpenAI JSON for validation', { 
        styleId: input.styleId, 
        keys: Object.keys(parsed),
        contentPreview: content.substring(0, 1000) 
      });
      
      const validationResult = AttributeExtractionSchema.safeParse(parsed);
      
      if (!validationResult.success) {
        logger.error('OpenAI Schema Validation Failed', { 
          styleId: input.styleId, 
          errors: validationResult.error.errors,
          rawResponse: content 
        });
        throw new Error(`OpenAI extraction failed: ${JSON.stringify(validationResult.error.errors)}`);
      }
      
      const validated = validationResult.data;

      logger.debug('LLM response parsed', {
        qcPassed: validated.qc.passed,
        hierarchyProductCategory: validated.hierarchy.product_category,
        hierarchyDepartment: validated.hierarchy.department,
        confidence: validated.confidence,
      });

      // ===== STEP 6: Parse "ID:Description" Format =====
      const parsedHierarchy = {
        productCategory: this.parseHierarchyField(validated.hierarchy.product_category),
        department: this.parseHierarchyField(validated.hierarchy.department),
        category: this.parseHierarchyField(validated.hierarchy.category),
        subCategory: this.parseHierarchyField(validated.hierarchy.sub_category),
      };

      logger.info('Hierarchy parsed', {
        productCategoryId: parsedHierarchy.productCategory.id,
        productCategory: parsedHierarchy.productCategory.description,
        departmentId: parsedHierarchy.department.id,
        department: parsedHierarchy.department.description,
      });

      // ===== STEP 7: Transform to Standardized Result =====
      const result: AttributeExtractionResult = {
        styleId: input.styleId,
        colorId: input.colorId,
        
        // QC
        qcPassed: validated.qc.passed,
        qcReason: validated.qc.reason,
        
        // Database-selected hierarchy (with separate ID fields)
        productCategory: parsedHierarchy.productCategory.description,
        productCategoryId: parsedHierarchy.productCategory.id,
        department: parsedHierarchy.department.description,
        departmentId: parsedHierarchy.department.id,
        category: parsedHierarchy.category.description,
        categoryId: parsedHierarchy.category.id,
        subCategory: parsedHierarchy.subCategory.description,
        subCategoryId: parsedHierarchy.subCategory.id,
        
        // Brand
        brand: validated.brand,
        
        // AI-generated hierarchy (free-form)
        aiProductCategory: validated.ai_hierarchy.product_category,
        aiDepartment: validated.ai_hierarchy.department,
        aiCategory: validated.ai_hierarchy.category,
        aiSubCategory: validated.ai_hierarchy.sub_category,
        aiBrandDesc: validated.ai_hierarchy.brand_desc,
        
        // Hierarchy confidence (per-level)
        hierarchyConfidence: validated.hierarchy_confidence,
        
        // Descriptions
        longStyleDesc: validated.long_description,
        shortStyleDesc: validated.short_description,
        colorAiDesc: this.buildColorDesc(validated.style_characteristics),
        
        // Style characteristics
        additionalAttributes: Object.fromEntries(
          Object.entries(validated.style_characteristics).map(([k, v]) => [k, (v as any).value])
        ),
        
        // Overall confidence
        confidence: validated.confidence,
        
        // Metadata
        processingTimeMs,
        rawResponse: content,
        llmMetadata: {
          model: this.model,
          tokensInput: usage?.prompt_tokens ?? 0,
          tokensOutput: usage?.completion_tokens ?? 0,
          estimatedCostUsd: this.calculateCost(
            usage?.prompt_tokens ?? 0,
            usage?.completion_tokens ?? 0
          ),
        },
        
        // v8.3: Audit Trail
        promptText: fullPromptText,
        enrichedContext: enrichedContext ? {
          erpAttributes: enrichedContext.erpAttributes.length,
          mandatoryRules: enrichedContext.mandatoryRules.filter(r => r.isMandatory).length
        } : undefined,
      };

      logger.info('OpenAI extraction complete', {
        styleId: input.styleId,
        colorId: input.colorId,
        processingTimeMs,
        tokensInput: usage?.prompt_tokens ?? 0,
        tokensOutput: usage?.completion_tokens ?? 0,
        cost: result.llmMetadata?.estimatedCostUsd,
        confidence: validated.confidence,
      });

      return result;
      
    } catch (error: any) {
      const processingTimeMs = Date.now() - startTime;
      logger.error('OpenAI extraction failed', {
        styleId: input.styleId,
        colorId: input.colorId,
        error: error.message,
        processingTimeMs,
      });
      throw new Error(`OpenAI extraction failed: ${error.message}`);
    }
  }

  /**
   * Health check (verify API key works)
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.openai.models.retrieve(this.model);
      return true;
    } catch (error: any) {
      logger.error('OpenAI health check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Rewrite product description based on attributes and tone.
   */
  async rewriteDescription(input: RewriteDescriptionInput): Promise<RewriteDescriptionResult> {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: REWRITE_SYSTEM_PROMPT },
          { role: 'user', content: buildRewritePrompt(input.attributes, input.tone, input.currentDescription) }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from OpenAI');

      const parsed = JSON.parse(content);
      return {
        shortDescription: parsed.short_description || '',
        longDescription: parsed.long_description || ''
      };
    } catch (error: any) {
      logger.error('OpenAI rewrite failed', { error: error.message, styleId: input.styleId });
      throw error;
    }
  }

  /**
   * Execute a generic prompt
   */
  async executePrompt(prompt: string, options?: { json?: boolean }): Promise<string | any> {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: this.temperature,
        response_format: options?.json ? { type: 'json_object' } : undefined
      });

      const content = response.choices[0]?.message?.content || '';
      return options?.json ? JSON.parse(content) : content;
    } catch (error: any) {
      logger.error('OpenAI generic prompt failed', { error: error.message });
      throw error;
    }
  }

  // ========================================================================
  // PRIVATE HELPERS
  // ========================================================================

  /**
   * Detect if this is a new product (all hierarchy fields empty).
   * New products need hierarchy options from cache.
   * Existing products already have DB classification.
   */
  private isNewProduct(context?: ExtractAttributesInput['context']): boolean {
    if (!context) {
      return true; // No context = new product
    }
    
    const hasHierarchy = 
      context.productCategory || 
      context.department || 
      context.category || 
      context.subCategory;
    
    return !hasHierarchy;
  }

  /**
   * Parse hierarchy field in format "ID:Description" into separate id and description.
   * 
   * Examples:
   * - "504:Childrens" → { id: "504", description: "Childrens" }
   * - "N/A" → { id: "", description: "" }
   * - "Childrens" (no colon) → { id: "", description: "Childrens" }
   * 
   * @param value - Hierarchy value from LLM
   * @returns Object with id and description
   */
  private parseHierarchyField(value: string): { id: string; description: string } {
    if (!value || value.toUpperCase() === 'N/A') {
      return { id: '', description: '' };
    }

    if (value.includes(':')) {
      const [id, ...rest] = value.split(':');
      return {
        id: id.trim(),
        description: rest.join(':').trim(), // Handle descriptions with colons
      };
    }

    // If no colon, treat entire value as description
    return { id: '', description: value.trim() };
  }

  /**
   * Build color description from style characteristics.
   * Combines primary and secondary colors.
   * Handles both string values and {value, confidence} objects from Zod schema.
   */
  private buildColorDesc(attrs: Record<string, any>): string {
    const extractValue = (val: any): string => {
      if (!val) return '';
      if (typeof val === 'string') return val;
      if (typeof val === 'object' && 'value' in val) return val.value || '';
      return '';
    };
    
    const primary = extractValue(attrs.primary_color);
    const secondary = extractValue(attrs.secondary_color);
    
    if (!primary) return '';
    if (!secondary || secondary === 'N/A') return primary;
    
    return `${primary} with ${secondary}`;
  }

  /**
   * Calculate estimated cost based on token usage.
   * 
   * Pricing (Dec 2024):
   * - gpt-4o-mini: $0.15/1M input, $0.60/1M output
   */
  private calculateCost(tokensInput: number, tokensOutput: number): number {
    const inputCost = (tokensInput / 1_000_000) * 0.15;
    const outputCost = (tokensOutput / 1_000_000) * 0.60;
    return inputCost + outputCost;
  }
}
