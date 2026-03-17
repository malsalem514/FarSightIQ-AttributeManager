/**
 * LLM Attribute Extraction Schema (Enhanced)
 * 
 * Zod schemas for OpenAI structured outputs with hierarchy classification.
 * Follows team's comprehensive schema with dual hierarchy approach.
 * 
 * Key features:
 * - Dual hierarchy: Database-selected (ID:Description) + AI-generated (free-form)
 * - Per-level confidence tracking
 * - Character limits enforced (60 chars short desc, etc.)
 * - Separate ID fields for database foreign keys
 */

import { z } from 'zod';

// ============================================================================
// QUALITY CHECK
// ============================================================================

/**
 * Quality Check (QC) result
 * Rejects non-retail or non-fashion images before extraction
 */
export const QCResultSchema = z.object({
  passed: z.boolean().describe('Whether image passed quality check'),
  reason: z.string().optional().describe('Reason for QC failure if applicable'),
});

// ============================================================================
// HIERARCHY CLASSIFICATION (Database-Selected)
// ============================================================================

/**
 * Product hierarchy selected from database options.
 * Format: "ID:Description" (e.g., "504:Childrens")
 * LLM must select from provided options (not hallucinate).
 */
export const DatabaseHierarchySchema = z.object({
  product_category: z.string().describe('Format: "grp_id:grp_descr" or "N/A"'),
  department: z.string().describe('Format: "dept_id:dept_name" or "N/A"'),
  category: z.string().describe('Format: "class_id:class_descr" or "N/A"'),
  sub_category: z.string().describe('Format: "subclass_id:subclass_descr" or "N/A"'),
});

/**
 * Confidence scores for each hierarchy level.
 * Tracks certainty of LLM's classification selection.
 */
// Helper to handle empty strings from LLM - converts "" to "N/A"
const ConfidenceLevelSchema = z.preprocess(
  (val) => (val === '' || val === null || val === undefined) ? 'N/A' : val,
  z.enum(['High', 'Medium', 'Low', 'N/A'])
).optional();

export const HierarchyConfidenceSchema = z.object({
  product_category: ConfidenceLevelSchema,
  department: ConfidenceLevelSchema,
  category: ConfidenceLevelSchema,
  sub_category: ConfidenceLevelSchema,
});

// ============================================================================
// AI-GENERATED HIERARCHY (Free-Form)
// ============================================================================

/**
 * AI-generated product hierarchy (NOT from database).
 * Free-form descriptions with enforced character limits.
 * Used when database hierarchy is unknown or for AI suggestions.
 */
export const AIGeneratedHierarchySchema = z.object({
  product_category: z.string().max(20).optional().describe('Free-form category (max 20 chars, e.g., "Footwear")'),
  department: z.string().max(40).optional().describe('Free-form department (max 40 chars, e.g., "Mens Athletic")'),
  category: z.string().max(40).optional().describe('Free-form category (max 40 chars, e.g., "Running Shoes")'),
  sub_category: z.string().max(40).optional().describe('Free-form sub-category (max 40 chars, e.g., "Low-Top Sneakers")'),
  brand_desc: z.string().max(30).optional().describe('Free-form brand (max 30 chars, e.g., "Nike Performance")'),
});

// ============================================================================
// STYLE CHARACTERISTICS
// ============================================================================

/**
 * Style characteristic value - PRESERVES confidence from LLM response.
 * LLMs return complex objects with value and confidence:
 * - Simple: "Navy Blue" -> { value: "Navy Blue", confidence: 50 }
 * - Complex: { value: "Navy Blue", confidence: "High" } -> { value: "Navy Blue", confidence: 80 }
 */
export interface StyleCharacteristicValue {
  value: string;
  confidence: number; // 0-100 percentage
}

// Map text confidence to percentage
const confidenceToPercent = (conf?: string): number => {
  if (!conf) return 50; // Default to medium
  const lower = conf.toLowerCase();
  if (lower === 'high') return 85;
  if (lower === 'medium') return 60;
  if (lower === 'low') return 30;
  // Try parsing as number
  const num = parseInt(conf, 10);
  if (!isNaN(num)) return Math.min(100, Math.max(0, num));
  return 50;
};

const StyleCharacteristicValueSchema = z.union([
  z.string().transform(val => ({ value: val, confidence: 50 })), // Simple string -> default 50% confidence
  z.object({
    value: z.string().optional(),
    name: z.string().optional(),
    confidence: z.union([z.string(), z.number()]).optional(),
  }).transform(obj => ({
    value: obj.value || obj.name || '',
    confidence: typeof obj.confidence === 'number' 
      ? obj.confidence 
      : confidenceToPercent(obj.confidence as string)
  }))
]).transform(val => {
  // Normalize to { value, confidence } object
  if (typeof val === 'string') {
    return { value: val, confidence: 50 };
  }
  return val as StyleCharacteristicValue;
});

/**
 * Style characteristics (dynamic key-value pairs) with per-attribute confidence.
 * Common keys: primary_color, secondary_color, material, pattern, silhouette,
 * sleeve_type, neckline, collar_type, closure_type, length, fit_type, occasion, season
 */
export const StyleCharacteristicsSchema = z.record(
  z.string(),
  StyleCharacteristicValueSchema
).describe('Observable style attributes with confidence scores');

// ============================================================================
// COMPLETE LLM RESPONSE SCHEMA
// ============================================================================

/**
 * Complete attribute extraction result from LLM.
 * This is the raw response before parsing ID:Description format.
 */
export const AttributeExtractionSchema = z.object({
  // Quality Check
  qc: QCResultSchema,
  
  // Database-selected hierarchy (format: "ID:Description")
  hierarchy: DatabaseHierarchySchema.optional().default({
    product_category: 'N/A',
    department: 'N/A',
    category: 'N/A',
    sub_category: 'N/A'
  }),
  
  // Per-level confidence
  hierarchy_confidence: HierarchyConfidenceSchema.optional().default({}),
  
  // AI-generated hierarchy (free-form)
  ai_hierarchy: AIGeneratedHierarchySchema.optional().default({}),
  
  // Brand
  brand: z.string().default('unknown'),
  
  // Descriptions (character limits enforced)
  short_description: z.string().max(100).default(''),
  long_description: z.string().default(''),
  
  // Style characteristics
  style_characteristics: StyleCharacteristicsSchema.optional().default({}),
  
  // Overall confidence (with fallback to 'Medium' if not provided)
  confidence: z.enum(['High', 'Medium', 'Low', 'N/A']).default('Medium').describe('Overall extraction confidence'),
});

// ============================================================================
// PARSED RESULT (Post-Processing)
// ============================================================================

/**
 * Parsed hierarchy with separate ID and description fields.
 * Created by parsing "ID:Description" format from LLM response.
 */
export interface ParsedHierarchy {
  product_category: string;      // Description
  product_category_id: string;   // ID for database FK
  department: string;            // Description
  department_id: string;         // ID for database FK
  category: string;              // Description
  category_id: string;           // ID for database FK
  sub_category: string;          // Description
  sub_category_id: string;       // ID for database FK
}

/**
 * Complete parsed result with separate ID fields.
 * This is what the application uses (not the raw LLM response).
 */
export interface ParsedAttributeExtraction extends Omit<AttributeExtraction, 'hierarchy'> {
  hierarchy: ParsedHierarchy;
}

// Export types (TypeScript-first)
export type QCResult = z.infer<typeof QCResultSchema>;
export type DatabaseHierarchy = z.infer<typeof DatabaseHierarchySchema>;
export type HierarchyConfidence = z.infer<typeof HierarchyConfidenceSchema>;
export type AIGeneratedHierarchy = z.infer<typeof AIGeneratedHierarchySchema>;
export type StyleCharacteristics = z.infer<typeof StyleCharacteristicsSchema>;
export type AttributeExtraction = z.infer<typeof AttributeExtractionSchema>;

/**
 * Input validation schema (for API requests)
 */
export const ExtractAttributesInputSchema = z.object({
  image: z.object({
    data: z.string().describe('Base64-encoded image data'),
    format: z.enum(['image/jpeg', 'image/png', 'image/webp']).describe('Image MIME type'),
  }).refine(
    (img) => {
      try {
        const buffer = Buffer.from(img.data, 'base64');
        return buffer.length <= 20_000_000; // 20MB max
      } catch {
        return false;
      }
    },
    { message: 'Image size must be ≤ 20MB and valid base64' }
  ),
  
  context: z.object({
    product_category: z.string().optional(),
    department: z.string().optional(),
    brand: z.string().optional(),
    style_id: z.string().optional(),
  }).optional().describe('Optional context hints from ERP'),
});

export type ExtractAttributesInput = z.infer<typeof ExtractAttributesInputSchema>;

