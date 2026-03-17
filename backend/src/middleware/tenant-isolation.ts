import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export interface TenantRequest extends Request {
  tenantId?: string;
}

export function tenantIsolation(req: TenantRequest, res: Response, next: NextFunction) {
  const tenantId = req.header('X-TENANT-ID');

  if (!tenantId) {
    logger.warn('Missing X-TENANT-ID header', { url: req.originalUrl });
    return res.status(403).json({
      success: false,
      error: { code: 'TENANT_REQUIRED', message: 'X-TENANT-ID header is required' }
    });
  }

  req.tenantId = tenantId;
  next();
}
