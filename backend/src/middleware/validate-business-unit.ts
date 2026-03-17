/**
 * Business Unit Validation Middleware
 * 
 * Validates business_unit_id from query params or body
 * Attaches parsed value to req.businessUnitId for downstream handlers
 */

import { Request, Response, NextFunction } from 'express';

export interface BusinessUnitRequest extends Request {
  businessUnitId?: number;
}

/**
 * Validate business_unit_id from query params
 */
export function validateBusinessUnitQuery(
  req: BusinessUnitRequest,
  res: Response,
  next: NextFunction
) {
  const businessUnitId = parseInt(req.query.business_unit_id as string);

  if (!businessUnitId || isNaN(businessUnitId)) {
    return res.status(400).json({
      success: false,
      error: { 
        code: 'MISSING_PARAM',
        message: 'business_unit_id is required and must be a number' 
      }
    });
  }

  req.businessUnitId = businessUnitId;
  next();
}

/**
 * Validate business_unit_id from request body
 */
export function validateBusinessUnitBody(
  req: BusinessUnitRequest,
  res: Response,
  next: NextFunction
) {
  const businessUnitId = req.body.business_unit_id;

  if (!businessUnitId || isNaN(businessUnitId)) {
    return res.status(400).json({
      success: false,
      error: { 
        code: 'MISSING_PARAM',
        message: 'business_unit_id is required and must be a number' 
      }
    });
  }

  req.businessUnitId = businessUnitId;
  next();
}

