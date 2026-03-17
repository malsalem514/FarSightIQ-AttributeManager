/**
 * Images Route (v2 - Robust)
 * Implementation of official Oracle Middle-Tier BLOB Proxy pattern.
 * Resolves ORA-22992 by materializing remote BLOBs locally on-demand.
 * 
 * HARDENING:
 * - Request throttling to prevent pool exhaustion
 * - Circuit breaker for failing images
 * - Aggressive timeouts with graceful fallbacks
 * - In-memory request deduplication
 */

import { Router } from 'express';
import { withMediaConnection } from '../services/oracle-pool.js';
import { logger } from '../utils/logger.js';
import { SettingsService } from '../services/settings.service.js';
import { asyncHandler } from '../middleware/oracle-error-handler.js';

const router = Router();

// ============================================================================
// IMAGE REQUEST THROTTLING & CIRCUIT BREAKER
// ============================================================================

/** Track in-flight requests to deduplicate concurrent requests for same image */
const inFlightRequests = new Map<string, Promise<Buffer | null>>();

/** Track failed images to implement circuit breaker (prevents hammering broken images) */
const failedImages = new Map<string, { count: number; lastFail: number }>();
const CIRCUIT_BREAKER_THRESHOLD = 3; // Failures before tripping
const CIRCUIT_BREAKER_RESET_MS = 5 * 60 * 1000; // 5 minutes

/** Max concurrent image requests to prevent pool exhaustion */
let activeImageRequests = 0;
const MAX_CONCURRENT_IMAGE_REQUESTS = 10;

/** Request timeout for image materialization (15 seconds) */
const IMAGE_TIMEOUT_MS = 15000;

/**
 * Check if circuit breaker is tripped for an image
 */
function isCircuitOpen(imageName: string): boolean {
  const failure = failedImages.get(imageName);
  if (!failure) return false;
  
  // Reset if enough time has passed
  if (Date.now() - failure.lastFail > CIRCUIT_BREAKER_RESET_MS) {
    failedImages.delete(imageName);
    return false;
  }
  
  return failure.count >= CIRCUIT_BREAKER_THRESHOLD;
}

/**
 * Record a failure for circuit breaker
 */
function recordFailure(imageName: string): void {
  const existing = failedImages.get(imageName) || { count: 0, lastFail: 0 };
  failedImages.set(imageName, { count: existing.count + 1, lastFail: Date.now() });
}

/**
 * Fetch image with timeout wrapper
 */
async function fetchImageWithTimeout(
  tenantId: string,
  imageName: string
): Promise<Buffer | null> {
  return new Promise(async (resolve) => {
    const timeoutId = setTimeout(() => {
      logger.warn('[ImageProxy] Timeout fetching image', { imageName, timeoutMs: IMAGE_TIMEOUT_MS });
      recordFailure(imageName);
      resolve(null);
    }, IMAGE_TIMEOUT_MS);
    
    try {
      const buffer = await withMediaConnection(async (connection) => {
        // 1. Try local cache first (fast path)
        const cacheResult = await connection.execute(
          `SELECT BLOB_DATA FROM ATTR_MGR.IMAGE_PROXY_CACHE WHERE IMAGE_NAME = :imageName`,
          { imageName }
        );
        
        if (cacheResult.rows && cacheResult.rows.length > 0) {
          const blob = (cacheResult.rows[0] as any).BLOB_DATA;
          if (blob) {
            return await blob.getData();
          }
        }
        
        // 2. Cache miss - try to materialize from remote
        try {
          await connection.execute(
            `BEGIN ATTR_MGR.FETCH_REMOTE_IMAGE(:tenantId, :imageName); END;`,
            { tenantId, imageName }
          );
          
          // 3. Fetch from local cache again
          const result = await connection.execute(
            `SELECT BLOB_DATA FROM ATTR_MGR.IMAGE_PROXY_CACHE WHERE IMAGE_NAME = :imageName`,
            { imageName }
          );
          
          if (result.rows && result.rows.length > 0) {
            const blob = (result.rows[0] as any).BLOB_DATA;
            if (blob) {
              return await blob.getData();
            }
          }
        } catch (matError: any) {
          logger.warn('[ImageProxy] Materialization failed', { imageName, error: matError.message });
        }
        
        return null;
      });
      
      clearTimeout(timeoutId);
      resolve(buffer);
    } catch (error: any) {
      clearTimeout(timeoutId);
      logger.error('[ImageProxy] Fetch error', { imageName, error: error.message });
      recordFailure(imageName);
      resolve(null);
    }
  });
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/images/draft/:sessionId
 * Serve draft photos from local STAGING_IMAGES
 */
router.get('/draft/:sessionId', asyncHandler(async (req, res) => {
  const sessionId = req.params.sessionId as string;

  try {
    await withMediaConnection(async (connection) => {
      const result = await connection.execute(
        `SELECT BLOB_DATA, CONTENT_TYPE FROM ATTR_MGR.STAGING_IMAGES WHERE SESSION_ID = :sessionId`,
        { sessionId }
      );

      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0] as any;
        res.setHeader('Content-Type', row.CONTENT_TYPE || 'image/jpeg');
        const buffer = await row.BLOB_DATA.getData();
        res.send(buffer);
      } else {
        res.status(404).send('Draft image not found.');
      }
    });
  } catch (error: any) {
    logger.error('Draft Image Proxy Failure', { sessionId, error: error.message });
    res.status(500).send('Internal error.');
  }
}));

/**
 * GET /api/images/:imageName
 * On-demand materialization and streaming of Oracle BLOBs.
 * Uses dedicated Media Connection Pool to prevent metadata starvation.
 * 
 * ROBUSTNESS FEATURES:
 * - Circuit breaker for repeatedly failing images
 * - Request deduplication for concurrent requests
 * - Concurrency throttling
 * - Aggressive timeouts
 */
router.get('/:imageName', asyncHandler(async (req, res) => {
  const imageName = req.params.imageName as string;

  // 1. CIRCUIT BREAKER CHECK
  if (isCircuitOpen(imageName)) {
    res.status(503)
      .setHeader('Retry-After', '300')
      .send('Image temporarily unavailable. Try again later.');
    return;
  }
  
  // 2. CONCURRENCY THROTTLE
  if (activeImageRequests >= MAX_CONCURRENT_IMAGE_REQUESTS) {
    res.status(503)
      .setHeader('Retry-After', '5')
      .send('Server busy. Try again shortly.');
    return;
  }

  try {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();
    
    if (!tenantId) {
      res.status(400).send('No active tenant environment selected.');
      return;
    }

    // 3. REQUEST DEDUPLICATION
    // If there's already a request in-flight for this image, wait for it
    const existingRequest = inFlightRequests.get(imageName);
    if (existingRequest) {
      logger.debug('[ImageProxy] Joining existing request', { imageName });
      const buffer = await existingRequest;
      if (buffer) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(buffer);
      } else {
        res.status(404).send('Image not found.');
      }
      return;
    }

    // 4. START NEW REQUEST
    activeImageRequests++;
    logger.info('[ImageProxy] Fetching', { imageName, tenantId, activeRequests: activeImageRequests });
    
    const fetchPromise = fetchImageWithTimeout(tenantId, imageName);
    inFlightRequests.set(imageName, fetchPromise);
    
    try {
      const buffer = await fetchPromise;
      
      if (buffer && buffer.length > 0) {
        logger.info('[ImageProxy] Success', { imageName, size: `${(buffer.length / 1024).toFixed(1)} KB` });
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(buffer);
      } else {
        logger.warn('[ImageProxy] Image not found or empty', { imageName });
        res.status(404).send('Image not found.');
      }
    } finally {
      inFlightRequests.delete(imageName);
      activeImageRequests--;
    }

  } catch (error: any) {
    logger.error('BLOB Proxy Failure', { imageName, error: error.message });
    recordFailure(imageName);
    res.status(500).send('Internal error while streaming database image.');
  }
}));

export default router;

