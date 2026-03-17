/**
 * Settings API Routes
 */

import { Router, Request, Response } from 'express';
import { SettingsService } from '../services/settings.service.js';
import { llmConfigService } from '../services/llm-config.service.js';
import { llmService } from '../services/llm/LLMService.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../middleware/oracle-error-handler.js';

const router = Router();

/**
 * GET /api/settings/llm
 * Get all LLM configurations
 */
router.get('/llm', asyncHandler(async (req: Request, res: Response) => {
  try {
    const configs = await llmConfigService.getAllConfigs();
    return res.json({ success: true, data: configs });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/settings/llm/test
 * Test a model by making a quick API call
 */
router.post('/llm/test', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { providerId, modelName } = req.body;
    if (!providerId || !modelName) {
      return res.status(400).json({ success: false, error: 'providerId and modelName required' });
    }

    logger.info('Testing LLM model', { providerId, modelName });

    // Get the provider config
    const config = await llmConfigService.getProviderConfig(providerId);
    if (!config || !config.API_KEY) {
      return res.status(400).json({ success: false, error: 'No API key configured for this provider' });
    }

    // Use the provider factory to test
    if (providerId === 'openai') {
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: config.API_KEY });
      
      // Newer models (gpt-5, o1, o3) use max_completion_tokens instead of max_tokens
      const isNewerModel = modelName.startsWith('gpt-5') || modelName.startsWith('o1') || modelName.startsWith('o3');
      
      // Make a minimal test call
      const requestParams: any = {
        model: modelName,
        messages: [{ role: 'user', content: 'Reply with just the word "OK"' }],
      };
      
      if (isNewerModel) {
        requestParams.max_completion_tokens = 10;
      } else {
        requestParams.max_tokens = 5;
        requestParams.temperature = 0;
      }
      
      const response = await openai.chat.completions.create(requestParams);
      
      const reply = response.choices?.[0]?.message?.content?.trim();
      logger.info('LLM test successful', { providerId, modelName, reply });
      
      return res.json({ success: true, message: `Model ${modelName} is working`, response: reply });
    } else if (providerId === 'gemini') {
      // For Gemini, use Google's SDK
      return res.json({ success: true, message: `Gemini test not implemented yet` });
    }

    return res.status(400).json({ success: false, error: `Unknown provider: ${providerId}` });
  } catch (error: any) {
    logger.error('LLM test failed', { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * GET /api/settings/llm/batch-config
 * Get batch processing configuration (v8.4)
 * IMPORTANT: Must be defined BEFORE /llm/:providerId to avoid route collision
 */
router.get('/llm/batch-config', asyncHandler(async (req: Request, res: Response) => {
  try {
    const config = await llmConfigService.getBatchConfig();
    return res.json({ success: true, data: config });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * PUT /api/settings/llm/batch-config
 * Update batch processing configuration (v8.4)
 * IMPORTANT: Must be defined BEFORE /llm/:providerId to avoid route collision
 */
router.put('/llm/batch-config', asyncHandler(async (req: Request, res: Response) => {
  try {
    const config = req.body;
    await llmConfigService.updateBatchConfig(config);
    return res.json({ success: true, message: 'Batch configuration updated' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * PUT /api/settings/llm/:providerId
 * Update LLM provider configuration
 */
router.put('/llm/:providerId', asyncHandler(async (req: Request, res: Response) => {
  try {
    const providerId = req.params.providerId as string;
    const config = req.body;
    await llmConfigService.updateConfig({ ...config, providerId });

    // Invalidate provider cache to ensure new config is picked up
    llmService.invalidateProviderCache(providerId);
    
    return res.json({ success: true, message: `LLM configuration updated for ${providerId}` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/settings
 * Get current application settings
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  try {
    const service = await SettingsService.getInstance();
    return res.json({ success: true, data: service.getSettings() });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/settings/database
 * Update database connection and reconnect
 */
router.post('/database', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { user, password, connect_string: connectString } = req.body;
    if (!user || !connectString) {
      return res.status(400).json({ success: false, error: { message: 'User and connect string required' } });
    }

    const service = await SettingsService.getInstance();
    await service.updateDatabase({ user, password, connectString });
    
    return res.json({ success: true, message: 'Database updated' });
  } catch (error: any) {
    logger.error('Database update failed', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/settings/remote-database
 * Update MERCH_REMOTE database link
 */
router.post('/remote-database', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { user, password, connect_string: connectString } = req.body;
    if (!user || !password || !connectString) {
      return res.status(400).json({ success: false, error: { message: 'User, password, and connect string required' } });
    }

    const service = await SettingsService.getInstance();
    await service.updateRemoteDatabase({ user, password, connectString });
    
    return res.json({ success: true, message: 'Remote database link updated and resync triggered' });
  } catch (error: any) {
    logger.error('Remote database update failed', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/settings/mode
 * Update application operational mode
 */
router.post('/mode', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { mode } = req.body;
    if (mode !== 'READ_ONLY' && mode !== 'READ_WRITE_IRI') {
      return res.status(400).json({ success: false, error: { message: 'Invalid mode' } });
    }

    const service = await SettingsService.getInstance();
    await service.updateMode(mode);
    
    return res.json({ success: true, message: `Mode updated to ${mode}` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/settings/save-database
 * Add or update a database in the saved list
 */
router.post('/save-database', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { name, user, connect_string: connectString, is_remote: isRemote } = req.body;
    if (!name || !user || !connectString) {
      return res.status(400).json({ success: false, error: { message: 'Name, user, and connect string required' } });
    }

    const service = await SettingsService.getInstance();
    await service.saveDatabaseToList({ name, user, connectString, isRemote });
    
    return res.json({ success: true, message: 'Database saved to list' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/settings/resync
 * Trigger manual cache resync
 */
router.post('/resync', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { business_unit_id: buId, force_full: forceFull } = req.body;
    const service = await SettingsService.getInstance();
    await service.triggerResync(
      buId ? parseInt(buId as string, 10) : undefined,
      forceFull === true
    );
    
    return res.json({ success: true, message: 'Resync triggered' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * GET /api/settings/environments
 * Get list of available ERP environments
 */
router.get('/environments', asyncHandler(async (req: Request, res: Response) => {
  try {
    const service = await SettingsService.getInstance();
    const environments = await service.getEnvironments();
    return res.json({ success: true, data: environments });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/settings/switch-environment
 * Atomic switch to a new environment
 */
router.post('/switch-environment', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { env_id: envId, username } = req.body;
    if (!envId) {
      return res.status(400).json({ success: false, error: { message: 'Environment ID required' } });
    }

    const service = await SettingsService.getInstance();
    const result = await service.switchEnvironment(envId, username);
    
    return res.json({ 
      success: true, 
      message: `Successfully switched to ${envId}`,
      data: result
    });
  } catch (error: any) {
    logger.error('Environment switch failed', { error: error.message });
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

/**
 * POST /api/settings/image-server
 * Update image base URL for an environment
 */
router.post('/image-server', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { env_id: envId, image_url: imageUrl } = req.body;
    if (!envId || !imageUrl) {
      return res.status(400).json({ success: false, error: { message: 'envId and image_url required' } });
    }

    const service = await SettingsService.getInstance();
    await service.updateImageBaseUrl(envId, imageUrl);
    
    return res.json({ success: true, message: `Image server updated for ${envId}. Background refresh triggered.` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
}));

export default router;

