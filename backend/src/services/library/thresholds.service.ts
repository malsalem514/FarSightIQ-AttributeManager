/**
 * Thresholds Service
 * 
 * Manage per-type confidence thresholds for fuzzy mapping
 * Stored in LLM_TYPE_THRESHOLDS table
 */

import { withConnection } from '../oracle-pool.js';
import { logger } from '../../utils/logger.js';
import { QUERY_OPTIONS } from './constants.js';

export interface TypeThreshold {
  typeId: string;
  minConfidence: number;
  description?: string;
}

/**
 * Get all thresholds for a business unit
 */
export async function getThresholds(businessUnitId: number): Promise<TypeThreshold[]> {
  try {
    return await withConnection(async (conn) => {
      const result = await conn.execute(
        `SELECT CHAR_TYPE_ID, MIN_CONFIDENCE
         FROM LLM_TYPE_THRESHOLDS
         WHERE BUSINESS_UNIT_ID = :bu`,
        { bu: businessUnitId },
        QUERY_OPTIONS
      );

      return ((result.rows || []) as any[]).map(row => ({
        typeId: row.CHAR_TYPE_ID,
        minConfidence: row.MIN_CONFIDENCE
      }));
    });
  } catch (error: any) {
    // Table doesn't exist yet, return empty
    if (error.message.includes('ORA-00942')) {
      return [];
    }
    throw error;
  }
}

/**
 * Set threshold for a specific type (upsert)
 * Requires V006__type_thresholds.sql to be run first
 */
export async function setThreshold(
  businessUnitId: number, 
  typeId: string, 
  minConfidence: number
): Promise<TypeThreshold> {
  return await withConnection(async (conn) => {
    // Upsert (table created by V006 migration)
    await conn.execute(
      `MERGE INTO LLM_TYPE_THRESHOLDS t
       USING (SELECT :bu AS BUSINESS_UNIT_ID, :type_id AS CHAR_TYPE_ID FROM DUAL) s
       ON (t.BUSINESS_UNIT_ID = s.BUSINESS_UNIT_ID AND t.CHAR_TYPE_ID = s.CHAR_TYPE_ID)
       WHEN MATCHED THEN
         UPDATE SET MIN_CONFIDENCE = :conf, MODIFIED_BY = USER, MODIFIED_AT = SYSTIMESTAMP
       WHEN NOT MATCHED THEN
         INSERT (BUSINESS_UNIT_ID, CHAR_TYPE_ID, MIN_CONFIDENCE, CREATED_BY, CREATED_AT)
         VALUES (:bu, :type_id, :conf, USER, SYSTIMESTAMP)`,
      { bu: businessUnitId, type_id: typeId, conf: minConfidence },
      { autoCommit: true }
    );

    logger.info('Threshold set', { businessUnitId, typeId, minConfidence });
    return { typeId, minConfidence };
  });
}

/**
 * Delete threshold (revert to default)
 */
export async function deleteThreshold(businessUnitId: number, typeId: string): Promise<void> {
  try {
    await withConnection(async (conn) => {
      await conn.execute(
        `DELETE FROM LLM_TYPE_THRESHOLDS 
         WHERE BUSINESS_UNIT_ID = :bu AND CHAR_TYPE_ID = :type_id`,
        { bu: businessUnitId, type_id: typeId },
        { autoCommit: true }
      );
      logger.info('Threshold deleted', { businessUnitId, typeId });
    });
  } catch (error: any) {
    // Ignore if table doesn't exist
    if (!error.message.includes('ORA-00942')) {
      throw error;
    }
  }
}

// Table LLM_TYPE_THRESHOLDS created by V006__type_thresholds.sql migration

