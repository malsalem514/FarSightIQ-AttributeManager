/**
 * Google Gemini Provider
 * 
 * Native Google Gemini integration using official SDK.
 * 
 * Key features:
 * - Official Google Generative AI SDK
 * - Vision support (gemini-1.5-flash)
 * - Hierarchy classification support
 * - Native JSON output support
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { AttributeExtractionSchema } from '../../schemas/llm-attributes.schema.js';
import { SYSTEM_PROMPT, buildUserPrompt } from '../../prompts/attribute-extraction.js';
import { REWRITE_SYSTEM_PROMPT, buildRewritePrompt } from '../../prompts/description-rewrite.js';
import { hierarchyCacheService } from '../hierarchy-cache.service.js';
import { logger } from '../../utils/logger.js';
import type { 
  LLMProvider, 
  ExtractAttributesInput, 
  AttributeExtractionResult,
  RewriteDescriptionInput,
  RewriteDescriptionResult
} from './types.js';

/**
 * Gemini Provider Configuration
 */
export interface GeminiProviderConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Google Gemini LLM Provider
 */
export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  
  private genAI: GoogleGenerativeAI;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config: GeminiProviderConfig) {
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.model = config.model || 'gemini-3-flash';
    this.temperature = config.temperature ?? 0.2;
    this.maxTokens = config.maxTokens || 2048;
  }

  /**
   * Extract attributes from product image with hierarchy classification.
   */
  async extractAttributes(input: ExtractAttributesInput): Promise<AttributeExtractionResult> {
    const startTime = Date.now();

    try {
      const isNewProduct = this.isNewProduct(input.context);
      
      logger.info('Extracting attributes via Gemini', {
        styleId: input.styleId,
        colorId: input.colorId,
        businessUnitId: input.businessUnitId,
        isNewProduct,
      });

      // Load hierarchy options
      let hierarchyOptions;
      if (isNewProduct && input.businessUnitId) {
        try {
          hierarchyOptions = await hierarchyCacheService.getCache(input.businessUnitId);
        } catch (error: any) {
          logger.warn('Failed to load hierarchy options for Gemini', { error: error.message });
        }
      }

      const userPrompt = buildUserPrompt(input.context, hierarchyOptions, input.focusedAttributes);

      // Initialize model
      const model = this.genAI.getGenerativeModel({ 
        model: this.model,
        generationConfig: {
          temperature: this.temperature,
          maxOutputTokens: this.maxTokens,
          responseMimeType: "application/json", // Gemini supports native JSON mode
        }
      });

      // Prepare multi-modal prompt
      const result = await model.generateContent([
        { text: SYSTEM_PROMPT + "\n\n" + userPrompt },
        {
          inlineData: {
            data: input.imageBase64,
            mimeType: "image/jpeg"
          }
        }
      ]);

      const response = await result.response;
      const content = response.text();
      const processingTimeMs = Date.now() - startTime;

      if (!content) {
        throw new Error('Empty Gemini response');
      }

      // Parse and Validate Response
      const parsed = JSON.parse(content);
      const validated = AttributeExtractionSchema.parse(parsed);

      // Parse "ID:Description" Format
      const parsedHierarchy = {
        productCategory: this.parseHierarchyField(validated.hierarchy.product_category),
        department: this.parseHierarchyField(validated.hierarchy.department),
        category: this.parseHierarchyField(validated.hierarchy.category),
        subCategory: this.parseHierarchyField(validated.hierarchy.sub_category),
      };

      // Transform to Standardized Result
      return {
        styleId: input.styleId,
        colorId: input.colorId,
        qcPassed: validated.qc.passed,
        qcReason: validated.qc.reason,
        productCategory: parsedHierarchy.productCategory.description,
        productCategoryId: parsedHierarchy.productCategory.id,
        department: parsedHierarchy.department.description,
        departmentId: parsedHierarchy.department.id,
        category: parsedHierarchy.category.description,
        categoryId: parsedHierarchy.category.id,
        subCategory: parsedHierarchy.subCategory.description,
        subCategoryId: parsedHierarchy.subCategory.id,
        brand: validated.brand,
        aiProductCategory: validated.ai_hierarchy.product_category,
        aiDepartment: validated.ai_hierarchy.department,
        aiCategory: validated.ai_hierarchy.category,
        aiSubCategory: validated.ai_hierarchy.sub_category,
        aiBrandDesc: validated.ai_hierarchy.brand_desc,
        hierarchyConfidence: validated.hierarchy_confidence,
        longStyleDesc: validated.long_description,
        shortStyleDesc: validated.short_description,
        colorAiDesc: this.buildColorDesc(validated.style_characteristics),
        additionalAttributes: Object.fromEntries(
          Object.entries(validated.style_characteristics).map(([k, v]) => [k, (v as any).value])
        ),
        confidence: validated.confidence,
        processingTimeMs,
        rawResponse: content,
        llmMetadata: {
          model: this.model,
          tokensInput: response.usageMetadata?.promptTokenCount ?? 0,
          tokensOutput: response.usageMetadata?.candidatesTokenCount ?? 0,
          estimatedCostUsd: 0, // Flash is extremely cheap/free for some tiers
        },
      };
      
    } catch (error: any) {
      const processingTimeMs = Date.now() - startTime;
      logger.error('Gemini extraction failed', { error: error.message, processingTimeMs });
      throw new Error(`Gemini extraction failed: ${error.message}`);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });
      const result = await model.generateContent("ping");
      return !!result.response.text();
    } catch (error: any) {
      logger.error('Gemini health check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Rewrite description
   */
  async rewriteDescription(input: RewriteDescriptionInput): Promise<RewriteDescriptionResult> {
    try {
      const model = this.genAI.getGenerativeModel({ 
        model: this.model,
        generationConfig: { responseMimeType: "application/json" }
      });

      const result = await model.generateContent([
        { text: REWRITE_SYSTEM_PROMPT + "\n\n" + buildRewritePrompt(input.attributes, input.tone, input.currentDescription) }
      ]);

      const content = result.response.text();
      const parsed = JSON.parse(content);
      
      return {
        shortDescription: parsed.short_description || '',
        longDescription: parsed.long_description || ''
      };
    } catch (error: any) {
      logger.error('Gemini rewrite failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute a generic prompt
   */
  async executePrompt(prompt: string, options?: { json?: boolean }): Promise<string | any> {
    try {
      const model = this.genAI.getGenerativeModel({ 
        model: this.model,
        generationConfig: { 
          responseMimeType: options?.json ? "application/json" : "text/plain" 
        }
      });

      const result = await model.generateContent(prompt);
      const content = result.response.text();
      return options?.json ? JSON.parse(content) : content;
    } catch (error: any) {
      logger.error('Gemini generic prompt failed', { error: error.message });
      throw error;
    }
  }

  private isNewProduct(context?: ExtractAttributesInput['context']): boolean {
    if (!context) return true;
    return !(context.productCategory || context.department || context.category || context.subCategory);
  }

  private parseHierarchyField(value: string): { id: string; description: string } {
    if (!value || value.toUpperCase() === 'N/A') return { id: '', description: '' };
    if (value.includes(':')) {
      const [id, ...rest] = value.split(':');
      return { id: id.trim(), description: rest.join(':').trim() };
    }
    return { id: '', description: value.trim() };
  }

  /**
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
}

