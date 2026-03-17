/**
 * API Routes Index
 */

import { Router } from 'express';
import productsRouter from './products.route.js';
import attributesRouter from './attributes.route.js';
import libraryRouter from './library.route.js';
import syncRouter from './sync.route.js';
import dashboardRouter from './dashboard.route.js';
import businessUnitsRouter from './business-units.route.js';
import settingsRouter from './settings.route.js';
import autocompleteRouter from './autocomplete.route.js';
import imagesRouter from './images.route.js';
import taxonomyRouter from './taxonomy.route.js';
import jobsRouter from './jobs.route.js';
import qualityRouter from './quality.route.js';
import exportRouter from './export.route.js';
import adminRouter from './admin.route.js';
import sessionRouter from './session.route.js';
import { getPoolStats, pingOracle } from '../services/oracle-pool.js';
import { config } from '../config.js';
import { asyncHandler } from '../middleware/oracle-error-handler.js';
import { apiLimiter } from '../middleware/rate-limit.js';

const router = Router();

// Global rate limiting on all API routes
router.use(apiLimiter);

// Health check (HARD-08: Enhanced with Oracle ping + pool stats)
router.get('/health', asyncHandler(async (req, res) => {
  const poolStats = getPoolStats();
  const oraclePing = await pingOracle();
  
  const isHealthy = oraclePing.ok;
  
  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy, // Added for consistency with other endpoints
    status: isHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    oracle: {
      connected: oraclePing.ok,
      latencyMs: oraclePing.latencyMs,
      pool: poolStats
    },
    services: {
      llmProvider: config.llm.provider,
      llmModel: config.llm.provider === 'openai' ? config.llm.openaiModel : config.llm.geminiModel
    }
  });
}));

// Liveness probe (k8s) - simple check
router.get('/health/live', (req, res) => {
  res.json({ status: 'alive' });
});

// Readiness probe (k8s) - checks dependencies
router.get('/health/ready', asyncHandler(async (req, res) => {
  const oraclePing = await pingOracle();
  res.status(oraclePing.ok ? 200 : 503).json({
    ready: oraclePing.ok,
    oracle: oraclePing.ok
  });
}));

// Mount routes
router.use('/products', productsRouter);
router.use('/attributes', attributesRouter);
router.use('/library', libraryRouter);
router.use('/sync', syncRouter);
router.use('/dashboard', dashboardRouter);
router.use('/business-units', businessUnitsRouter);
router.use('/settings', settingsRouter);
router.use('/autocomplete', autocompleteRouter);
router.use('/images', imagesRouter);
router.use('/taxonomy', taxonomyRouter);
router.use('/jobs', jobsRouter);
router.use('/quality', qualityRouter);
router.use('/export', exportRouter);
router.use('/admin', adminRouter);
router.use('/session', sessionRouter);

export default router;

