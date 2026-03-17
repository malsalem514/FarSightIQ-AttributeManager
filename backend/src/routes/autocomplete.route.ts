/**
 * Autocomplete Routes
 * 
 * GET /api/autocomplete - Get search suggestions
 */

import { Router, Request, Response } from 'express';
import { getAutocompleteService } from '../services/autocomplete.service.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../middleware/oracle-error-handler.js';

const router = Router();

/**
 * GET /api/autocomplete
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    const buId = parseInt(req.query.business_unit_id as string, 10);
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 50);

    if (isNaN(buId)) {
      return res.status(400).json({ success: false, error: { message: 'business_unit_id required' } });
    }

    if (query.length < 2) {
      return res.json({ success: true, suggestions: [] });
    }

    const service = getAutocompleteService();
    const suggestions = await service.getSuggestions(buId, query, limit);

    return res.json({
      success: true,
      suggestions: suggestions
    });
  } catch (error: any) {
    logger.error('Autocomplete route failed', { error: error.message });
    return res.status(500).json({
      success: false,
      error: { code: 'AUTOCOMPLETE_ERROR', message: error.message }
    });
  }
}));

export default router;

