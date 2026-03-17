/**
 * Attribute Manager Backend
 * 
 * Express.js API server for VisionMerch Attribute Manager
 * Hardened for production (HARD-01 through HARD-10)
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config, validateConfig } from './config.js';
import { createPool, closePool } from './services/oracle-pool.js';
import { logger } from './utils/logger.js';
import { formatErrorResponse, AppError } from './utils/errors.js';
import { SettingsService } from './services/settings.service.js';
import routes from './routes/index.js';
import { startLlmWorker } from './workers/llmWorker.js';

const app = express();

// Trust proxy (for rate limiting behind load balancer)
app.set('trust proxy', 1);

// Security headers via helmet
app.use(helmet({
  contentSecurityPolicy: false, // Disabled - frontend serves its own CSP
  crossOriginEmbedderPolicy: false, // Allow image loading from Oracle BLOB proxy
  hsts: config.nodeEnv === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

// Response compression
app.use(compression());

// CORS (HARD-03: Lockdown)
app.use(cors({ 
  origin: config.corsOrigins,
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Body parsing
app.use(express.json({ limit: '10mb' })); // Allow large thumbnails

// Request correlation ID + logging
app.use((req, res, next) => {
  const requestId = (req.headers['x-request-id'] as string) || logger.correlationId();
  res.setHeader('X-Request-ID', requestId);
  (req as any).requestId = requestId;

  const start = Date.now();
  res.on('finish', () => {
    logger.info(`${req.method} ${req.path}`, {
      requestId,
      status: res.statusCode,
      duration: `${Date.now() - start}ms`
    });
  });
  next();
});

// API Routes
app.use('/api', routes);

// Fallback for direct image requests (fixes malformed UI URLs)
app.get('/:imageName', (req, res, next) => {
  const { imageName } = req.params;
  if (imageName.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
    logger.info(`[Fallback] Redirecting root image request to proxy: ${imageName}`);
    res.redirect(`/api/images/${imageName}`);
    return;
  }
  next();
});

// Error handler (HARD-09: Standardized errors)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const isDev = config.nodeEnv === 'development';

  // Log error — suppress stack traces in production
  logger.error('Request error', {
    path: req.path,
    method: req.method,
    error: err.message,
    ...(isDev && { stack: err.stack }),
    code: err.code
  });

  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err);
  }

  // Handle known errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  // Format unknown errors
  const response = formatErrorResponse(err, isDev);
  res.status(500).json(response);
});

/**
 * Start server
 */
async function start(): Promise<void> {
  // Validate configuration
  const { valid, missing } = validateConfig();
  if (!valid) {
    logger.error('Missing required configuration', { missing });
    logger.info('Create a .env file with: ORACLE_USER, ORACLE_PASSWORD, ORACLE_CONNECT_STRING');
    process.exit(1);
  }
  
  // Initialize Oracle pool
  try {
    await createPool();
    
    // Initialize Settings (Warm up environment links)
    const settings = await SettingsService.getInstance();
    await settings.initialize();
  } catch (error: any) {
    logger.error('Failed to connect to Oracle', { error: error.message });
    logger.info('Make sure Oracle is accessible and credentials are correct');
    process.exit(1);
  }
  
  // Start server
  const isWorker = process.argv.includes('--worker');
  
  if (isWorker) {
    logger.info('Starting in WORKER mode');
    // Ensure the process doesn't exit by awaiting the worker loop
    await startLlmWorker().catch(e => {
      logger.error('Worker failed', { error: e.message });
      process.exit(1);
    });
  } else {
    server = app.listen(config.port, () => {
      logger.info(`Attribute Manager API running on http://localhost:${config.port}`);
    });
  }
}

// Graceful shutdown
let isShuttingDown = false;
let server: ReturnType<typeof app.listen> | null = null;

async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('Shutting down gracefully...');

  // 1. Stop accepting new connections
  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });
      // Force close after 10s if connections won't drain
      setTimeout(resolve, 10000);
    });
  }

  // 2. Close database pool (waits for active queries)
  await closePool();

  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start
start().catch((error) => {
  logger.error('Failed to start server', { error: error.message });
  process.exit(1);
});

