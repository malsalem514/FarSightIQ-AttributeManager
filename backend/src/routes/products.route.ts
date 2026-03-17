/**
 * Products API Routes
 * 
 * Handles:
 * - Single image onboarding
 * - Bulk image upload (multiple files, ZIP)
 * - Hierarchy-first discovery
 * - Draft management
 */

import { Router, Request, Response } from 'express';
import { productsService } from '../services/products.service.js';
import { onboardingService } from '../services/onboarding.service.js';
import { logger } from '../utils/logger.js';
import multer from 'multer';
import AdmZip from 'adm-zip';
import path from 'path';
import { asyncHandler } from '../middleware/oracle-error-handler.js';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/zip', 'application/x-zip-compressed'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}`));
    }
  }
});

/**
 * POST /api/products/onboard
 * Start onboarding a new style from an image (single)
 */
router.post('/onboard', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { business_unit_id, image_name, image_base64 } = req.body;
    
    if (!business_unit_id || !image_base64) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'business_unit_id and image_base64 are required' }
      });
    }

    const result = await onboardingService.startOnboarding(
      parseInt(business_unit_id, 10),
      image_base64,
      image_name || 'upload.jpg'
    );

    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('Error onboarding style', { error: error.message });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
}));

/**
 * POST /api/products/onboard/bulk
 * Bulk onboard multiple images (files or ZIP)
 * 
 * Accepts: multipart/form-data with 'images' field (multiple files or single ZIP)
 * Returns: Batch ID for tracking progress
 */
router.post('/onboard/bulk', upload.array('images', 100), asyncHandler(async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    const businessUnitId = parseInt(req.body.business_unit_id, 10);
    
    if (!businessUnitId || isNaN(businessUnitId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'business_unit_id is required' }
      });
    }
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'No files uploaded' }
      });
    }

    // Extract images from ZIP if present
    let imageFiles: { name: string; buffer: Buffer }[] = [];
    
    for (const file of files) {
      if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed') {
        // Extract images from ZIP
        const zip = new AdmZip(file.buffer);
        const entries = zip.getEntries();
        
        for (const entry of entries) {
          if (!entry.isDirectory) {
            const ext = path.extname(entry.entryName).toLowerCase();
            if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
              imageFiles.push({
                name: path.basename(entry.entryName),
                buffer: entry.getData()
              });
            }
          }
        }
      } else {
        // Direct image file
        imageFiles.push({
          name: path.basename(file.originalname),
          buffer: file.buffer
        });
      }
    }

    if (imageFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_IMAGES', message: 'No valid images found in upload' }
      });
    }

    logger.info('Starting bulk onboarding', { businessUnitId, imageCount: imageFiles.length });

    // Start batch processing
    const batchResult = await onboardingService.startBulkOnboarding(
      businessUnitId,
      imageFiles
    );

    return res.json({
      success: true,
      data: batchResult
    });
  } catch (error: any) {
    logger.error('Bulk onboarding failed', { error: error.message });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
}));

/**
 * POST /api/products/onboard/discover-hierarchy
 * Step 1: Identify hierarchy only (without full attribute extraction)
 */
router.post('/onboard/discover-hierarchy', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { business_unit_id, image_base64, image_name } = req.body;
    
    if (!business_unit_id || !image_base64) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'business_unit_id and image_base64 are required' }
      });
    }

    const result = await onboardingService.discoverHierarchy(
      parseInt(business_unit_id, 10),
      image_base64,
      image_name
    );

    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('Hierarchy discovery failed', { error: error.message });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
}));

/**
 * GET /api/products/onboard/batch/:batchId
 * Get status of a bulk onboarding batch
 */
router.get('/onboard/batch/:batchId', asyncHandler(async (req: Request, res: Response) => {
  try {
    const batchId = req.params.batchId as string;
    const result = await onboardingService.getBatchStatus(batchId);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('Failed to get batch status', { error: error.message });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
}));

/**
 * GET /api/products/drafts
 * Get all drafts (new products awaiting completion)
 */
router.get('/drafts', asyncHandler(async (req: Request, res: Response) => {
  try {
    const businessUnitId = parseInt(req.query.business_unit_id as string, 10);
    const status = req.query.status as string;
    
    if (!businessUnitId || isNaN(businessUnitId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'business_unit_id is required' }
      });
    }

    const drafts = await onboardingService.getDrafts(businessUnitId, status);
    
    return res.json({
      success: true,
      data: drafts
    });
  } catch (error: any) {
    logger.error('Failed to get drafts', { error: error.message });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
}));

/**
 * GET /api/products
 * 
 * Query params:
 *   - business_unit_id (required): Business unit ID
 *   - mode: 'existing' | 'new' (default: existing)
 *   - search: Search in style_id, name
 *   - departments[]: Filter by department
 *   - brands[]: Filter by brand
 *   - limit: Page size (default: 50)
 *   - offset: Page offset (default: 0)
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  try {
    const businessUnitId = parseInt(req.query.business_unit_id as string, 10);
    
    if (isNaN(businessUnitId) || businessUnitId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAM',
          message: 'business_unit_id is required and must be a positive integer'
        }
      });
    }

    const result = await productsService.getProducts({
      businessUnitId,
      mode: req.query.mode as 'existing' | 'new' | undefined,
      search: req.query.search as string | undefined,
      departments: parseArrayParam(req.query.departments),
      brands: parseArrayParam(req.query.brands),
      productCategories: parseArrayParam(req.query.product_categories),
      categories: parseArrayParam(req.query.categories),
      subCategories: parseArrayParam(req.query.sub_categories),
      missingDesc: req.query.missing_desc === 'true',
      noAttributes: req.query.no_attributes === 'true',
      limit: parseInt(req.query.limit as string, 10) || 50,
      offset: parseInt(req.query.offset as string, 10) || 0
    });

    return res.json(result);
  } catch (error: any) {
    logger.error('Error fetching products', { error: error.message });
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }
}));

/**
 * GET /api/products/filters
 * 
 * Returns unique values for filter dropdowns
 */
router.get('/filters', asyncHandler(async (req: Request, res: Response) => {
  try {
    const businessUnitId = parseInt(req.query.business_unit_id as string, 10);
    
    if (isNaN(businessUnitId) || businessUnitId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAM',
          message: 'business_unit_id is required'
        }
      });
    }

    const filters = await productsService.getFilters(businessUnitId);
    
    return res.json({
      success: true,
      data: filters
    });
  } catch (error: any) {
    logger.error('Error fetching filters', { error: error.message });
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }
}));

/**
 * GET /api/products/hierarchy
 * 
 * Returns hierarchical data for cascading filters:
 * Department → Class → Subclass
 */
router.get('/hierarchy', asyncHandler(async (req: Request, res: Response) => {
  try {
    const businessUnitId = parseInt(req.query.business_unit_id as string, 10);
    
    if (isNaN(businessUnitId) || businessUnitId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAM',
          message: 'business_unit_id is required'
        }
      });
    }

    const hierarchy = await productsService.getHierarchy(businessUnitId);
    
    return res.json({
      success: true,
      data: hierarchy
    });
  } catch (error: any) {
    logger.error('Error fetching hierarchy', { error: error.message });
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }
}));

/**
 * PUT /api/products/draft/:sessionId
 * Update a draft's hierarchy, descriptions, and attributes
 */
router.put('/draft/:sessionId', asyncHandler(async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.sessionId as string, 10);
    if (isNaN(sessionId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Invalid session ID' }
      });
    }

    const { shortDescription, longDescription, hierarchy, color, sizeScale } = req.body;
    
    const result = await onboardingService.updateDraft(sessionId, {
      shortDescription,
      longDescription,
      hierarchy,
      color,
      sizeScale
    });

    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('Error updating draft', { error: error.message });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
}));

/**
 * DELETE /api/products/draft/:sessionId
 * Delete a single draft
 */
router.delete('/draft/:sessionId', asyncHandler(async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.sessionId as string, 10);
    if (isNaN(sessionId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Invalid session ID' }
      });
    }

    await onboardingService.deleteDraft(sessionId);

    return res.json({
      success: true,
      message: `Draft ${sessionId} deleted successfully`
    });
  } catch (error: any) {
    logger.error('Error deleting draft', { error: error.message });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
}));

/**
 * DELETE /api/products/drafts
 * Delete multiple drafts (bulk delete)
 */
router.delete('/drafts', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { session_ids } = req.body;
    
    if (!session_ids || !Array.isArray(session_ids) || session_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'session_ids array is required' }
      });
    }

    const results = await Promise.allSettled(
      session_ids.map((id: number) => onboardingService.deleteDraft(id))
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return res.json({
      success: true,
      data: {
        deleted: succeeded,
        failed: failed,
        total: session_ids.length
      }
    });
  } catch (error: any) {
    logger.error('Error bulk deleting drafts', { error: error.message });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
}));

/**
 * GET /api/products/draft/:sessionId/image
 * Get the image for a draft
 */
router.get('/draft/:sessionId/image', asyncHandler(async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.sessionId as string, 10);
    if (isNaN(sessionId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Invalid session ID' }
      });
    }

    const imageData = await onboardingService.getDraftImage(sessionId);
    
    if (!imageData) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Image not found' }
      });
    }

    // Set content type and send image
    res.setHeader('Content-Type', imageData.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(imageData.buffer);
  } catch (error: any) {
    logger.error('Error fetching draft image', { error: error.message });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
}));

/** Parse array query param (handles both single value and array) */
function parseArrayParam(param: any): string[] | undefined {
  if (!param) return undefined;
  if (Array.isArray(param)) return param as string[];
  return [param as string];
}

export default router;
