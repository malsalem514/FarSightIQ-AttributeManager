/**
 * User Session API Routes
 * 
 * Handles persistence of user workflow state for AttributeMe.
 * Pattern: Boring Vanilla REST
 */

import { Router, Request, Response } from 'express';
import { userSessionService } from '../services/user-session.service.js';
import { SettingsService } from '../services/settings.service.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../middleware/oracle-error-handler.js';

const router = Router();

/**
 * POST /api/session/save
 * Save user session state
 */
router.post('/save', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { user_id, business_unit_id, session_type, selected_items, processed_items, filters_state } = req.body;
    
    if (!user_id || !business_unit_id || !session_type) {
      return res.status(400).json({
        success: false,
        error: { message: 'user_id, business_unit_id, and session_type are required' }
      });
    }

    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();

    const sessionId = await userSessionService.saveSession(
      user_id,
      tenantId,
      business_unit_id,
      session_type,
      selected_items || [],
      processed_items || [],
      filters_state
    );

    return res.json({
      success: true,
      data: { session_id: sessionId }
    });
  } catch (error: any) {
    logger.error('Failed to save session', { error: error.message });
    return res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
}));

/**
 * GET /api/session/load
 * Load user session state
 */
router.get('/load', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { user_id, business_unit_id, session_type } = req.query;
    
    if (!user_id || !business_unit_id || !session_type) {
      return res.status(400).json({
        success: false,
        error: { message: 'user_id, business_unit_id, and session_type are required' }
      });
    }

    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();

    const session = await userSessionService.getSession(
      user_id as string,
      tenantId,
      parseInt(business_unit_id as string),
      session_type as string
    );

    if (!session) {
      return res.json({
        success: true,
        data: null
      });
    }

    return res.json({
      success: true,
      data: {
        session_id: session.sessionId,
        selected_items: session.selectedItems,
        processed_items: session.processedItems,
        filters_state: session.filtersState,
        last_active: session.lastActive
      }
    });
  } catch (error: any) {
    logger.error('Failed to load session', { error: error.message });
    return res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
}));

/**
 * DELETE /api/session/:sessionId
 * Clear user session
 */
router.delete('/:sessionId', asyncHandler(async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId as string;

    await userSessionService.clearSession(sessionId);
    
    return res.json({
      success: true
    });
  } catch (error: any) {
    logger.error('Failed to clear session', { error: error.message });
    return res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
}));

export default router;
