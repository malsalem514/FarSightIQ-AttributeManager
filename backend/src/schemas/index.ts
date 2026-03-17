/**
 * Zod Validation Schemas (HARD-07)
 * 
 * Input validation for all API endpoints
 */

import { z } from 'zod';

// ============================================================================
// Common Schemas
// ============================================================================

export const businessUnitIdSchema = z.number().int().min(1).max(999);
export const styleIdSchema = z.string().min(1).max(20);
export const colorIdSchema = z.string().min(1).max(10);
export const typeIdSchema = z.string().min(1).max(10);
export const valueIdSchema = z.string().min(1).max(10);

// ============================================================================
// Sync Schemas
// ============================================================================

export const syncCharacteristicSchema = z.object({
  typeId: typeIdSchema,
  valueId: valueIdSchema
});

export const syncStyleSchema = z.object({
  businessUnitId: businessUnitIdSchema,
  styleId: styleIdSchema,
  colorId: colorIdSchema.optional().default(''),
  characteristics: z.array(syncCharacteristicSchema).min(1).max(100),
  longDescription: z.string().max(4000).optional(),
  shortDescription: z.string().max(250).optional()
});

export const syncBulkSchema = z.object({
  businessUnitId: businessUnitIdSchema,
  styles: z.array(z.object({
    styleId: styleIdSchema,
    colorId: colorIdSchema.optional(),
    characteristics: z.array(syncCharacteristicSchema)
  })).min(1).max(100)
});

// ============================================================================
// Mapping Schemas
// ============================================================================

export const createMappingSchema = z.object({
  businessUnitId: businessUnitIdSchema,
  llmInput: z.string().min(1).max(200),
  targetTypeId: typeIdSchema,
  targetValueId: valueIdSchema,
  subType: z.enum(['STYL', 'COLR', 'SIZE', 'SITE']).optional().default('STYL'),
  confidenceThreshold: z.number().int().min(0).max(100).optional().default(80)
});

// ============================================================================
// Template Schemas
// ============================================================================

export const createTemplateSchema = z.object({
  businessUnitId: businessUnitIdSchema,
  templateName: z.string().min(1).max(100),
  targetCategory: z.string().max(50).optional(),
  typeIds: z.array(typeIdSchema).min(1).max(50),
  enforceOnSync: z.boolean().optional().default(false)
});

// ============================================================================
// Type/Value Schemas
// ============================================================================

export const createTypeSchema = z.object({
  businessUnitId: businessUnitIdSchema,
  typeId: typeIdSchema,
  subType: z.enum(['STYL', 'COLR', 'SIZE', 'SITE']).optional().default('STYL'),
  description: z.string().min(1).max(100)
});

export const createValueSchema = z.object({
  businessUnitId: businessUnitIdSchema,
  typeId: typeIdSchema,
  subType: z.enum(['STYL', 'COLR', 'SIZE', 'SITE']).optional().default('STYL'),
  valueId: valueIdSchema,
  description: z.string().min(1).max(100)
});

// ============================================================================
// Extraction Schemas
// ============================================================================

export const extractImageSchema = z.object({
  businessUnitId: businessUnitIdSchema,
  imageUrl: z.string().url().optional(),
  imageBase64: z.string().optional()
}).refine(
  data => data.imageUrl || data.imageBase64,
  { message: 'Either imageUrl or imageBase64 is required' }
);

export const extractBatchSchema = z.object({
  businessUnitId: businessUnitIdSchema,
  images: z.array(z.object({
    styleId: styleIdSchema,
    colorId: colorIdSchema,
    imageUrl: z.string().url()
  })).min(1).max(50)
});

// ============================================================================
// Query Schemas
// ============================================================================

export const productsQuerySchema = z.object({
  business_unit_id: z.coerce.number().int().min(1).max(999),
  department_id: z.string().optional(),
  class_id: z.string().optional(),
  brand_id: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

// ============================================================================
// Validation Helper
// ============================================================================

import { Request, Response, NextFunction } from 'express';

/**
 * Create validation middleware from Zod schema
 */
export function validate<T extends z.ZodType>(schema: T, source: 'body' | 'query' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const data = source === 'body' ? req.body : req.query;
    const result = schema.safeParse(data);
    
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: result.error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        }
      });
      return;
    }
    
    // Replace with parsed/validated data
    if (source === 'body') {
      req.body = result.data;
    } else {
      (req as any).validatedQuery = result.data;
    }
    
    next();
  };
}

