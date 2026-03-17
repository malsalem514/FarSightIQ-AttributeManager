/**
 * Library API Routes
 * 
 * Handles Characteristic Types, Values, Mappings, and Templates.
 */

import { Router, Request, Response } from 'express';
import { libraryService } from '../services/library/index.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../middleware/oracle-error-handler.js';

const router = Router();

// --- Types ---
router.get('/types', asyncHandler(async (req: Request, res: Response) => {
  try {
    const buId = parseInt(req.query.business_unit_id as string, 10);
    const subType = req.query.sub_type as string;
    const types = await libraryService.getTypes(buId, subType);
    return res.json({ success: true, data: types });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

router.post('/types', asyncHandler(async (req: Request, res: Response) => {
  try {
    const result = await libraryService.createType(req.body);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// --- Values ---
router.get('/values', asyncHandler(async (req: Request, res: Response) => {
  try {
    const buId = parseInt(req.query.business_unit_id as string, 10);
    const typeId = req.query.characteristic_type_id as string;
    const values = await libraryService.getValues(buId, typeId);
    return res.json({ success: true, data: values });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

router.post('/values', asyncHandler(async (req: Request, res: Response) => {
  try {
    const result = await libraryService.createValue(req.body);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// --- Mappings ---
router.get('/mappings', asyncHandler(async (req: Request, res: Response) => {
  try {
    const buId = parseInt(req.query.business_unit_id as string, 10);
    const mappings = await libraryService.getMappings(buId);
    return res.json({ success: true, data: mappings });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

router.post('/mappings', asyncHandler(async (req: Request, res: Response) => {
  try {
    const result = await libraryService.createMapping(req.body);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

router.get('/mappings/stats', asyncHandler(async (req: Request, res: Response) => {
  try {
    const buId = parseInt(req.query.business_unit_id as string, 10);
    const stats = await libraryService.getMappingStats(buId);
    return res.json({ success: true, data: stats });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

// --- Templates ---
router.get('/templates', asyncHandler(async (req: Request, res: Response) => {
  try {
    const buId = parseInt(req.query.business_unit_id as string, 10);
    const templates = await libraryService.getTemplates(buId);
    return res.json({ success: true, data: templates });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

export default router;

