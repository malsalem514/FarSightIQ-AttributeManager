/**
 * API Response Helper
 * 
 * Standardized response formatting for REST endpoints
 * Pattern: Consistent API responses (single source of truth)
 */

import { Response } from 'express';

/**
 * Send success response with data
 */
export function sendSuccess(
  res: Response,
  data: any,
  statusCode: number = 200
) {
  const response: any = { success: true };
  
  if (Array.isArray(data)) {
    response.data = data;
    response.count = data.length;
  } else if (data !== null && data !== undefined) {
    response.data = data;
  }
  
  res.status(statusCode).json(response);
}

/**
 * Send success response with message (for mutations)
 */
export function sendSuccessMessage(
  res: Response,
  message: string,
  meta?: Record<string, any>,
  statusCode: number = 200
) {
  res.status(statusCode).json({
    success: true,
    message,
    ...meta
  });
}

/**
 * Send error response
 */
export function sendError(
  res: Response,
  message: string,
  statusCode: number = 500,
  code: string = 'ERROR'
) {
  res.status(statusCode).json({
    success: false,
    error: { code, message }
  });
}

/**
 * Send 404 Not Found
 */
export function sendNotFound(
  res: Response,
  resource: string,
  identifier?: string
) {
  const message = identifier 
    ? `${resource} '${identifier}' not found`
    : `${resource} not found`;
    
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message }
  });
}

/**
 * Send 400 Bad Request
 */
export function sendBadRequest(
  res: Response,
  message: string
) {
  res.status(400).json({
    success: false,
    error: { code: 'BAD_REQUEST', message }
  });
}

