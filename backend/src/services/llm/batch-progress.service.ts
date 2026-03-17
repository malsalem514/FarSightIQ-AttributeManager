/**
 * Batch Progress Service (v8.3)
 * 
 * Tracks real-time progress for batch AI enrichment operations.
 * Uses Oracle table AI_BATCH_PROGRESS for persistence.
 * 
 * Pattern: Glass Box Monitoring (PAT-GLASS-BOX-MONITORING-01)
 */

import { randomUUID } from 'crypto';
import { withConnection } from '../oracle-pool.js';
import { logger } from '../../utils/logger.js';

export interface BatchProgress {
  batchId: string;
  tenantId: string;
  businessUnitId: number;
  totalItems: number;
  processedItems: number;
  successCount: number;
  errorCount: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'ERROR' | 'CANCELLED';
  currentStyleId?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export class BatchProgressService {
  /**
   * Create a new batch tracking record
   */
  async createBatch(
    tenantId: string,
    businessUnitId: number,
    totalItems: number,
    createdBy?: string
  ): Promise<string> {
    const batchId = randomUUID();
    
    try {
      await withConnection(async (conn) => {
        await conn.execute(
          `INSERT INTO ATTR_MGR.AI_BATCH_PROGRESS (
            BATCH_ID, TENANT_ID, BUSINESS_UNIT_ID, TOTAL_ITEMS, 
            STATUS, CREATED_BY, STARTED_AT
          ) VALUES (
            :batchId, :tenantId, :buId, :totalItems, 'RUNNING', :createdBy, CURRENT_TIMESTAMP
          )`,
          {
            batchId,
            tenantId,
            buId: businessUnitId,
            totalItems,
            createdBy: createdBy || 'system'
          }
        );
        await conn.commit();
      });
      
      logger.info('Batch created', { batchId, tenantId, totalItems });
      return batchId;
    } catch (e: any) {
      logger.error('Failed to create batch', { error: e.message });
      throw e;
    }
  }

  /**
   * Update batch progress after processing an item
   */
  async updateProgress(
    batchId: string,
    success: boolean,
    currentStyleId?: string
  ): Promise<void> {
    try {
      await withConnection(async (conn) => {
        const updateFields = success 
          ? 'PROCESSED_ITEMS = PROCESSED_ITEMS + 1, SUCCESS_COUNT = SUCCESS_COUNT + 1'
          : 'PROCESSED_ITEMS = PROCESSED_ITEMS + 1, ERROR_COUNT = ERROR_COUNT + 1';
        
        await conn.execute(
          `UPDATE ATTR_MGR.AI_BATCH_PROGRESS 
           SET ${updateFields}, 
               CURRENT_STYLE_ID = :styleId
           WHERE BATCH_ID = :batchId`,
          { batchId, styleId: currentStyleId || null }
        );
        await conn.commit();
      });
    } catch (e: any) {
      logger.error('Failed to update batch progress', { batchId, error: e.message });
    }
  }

  /**
   * Mark batch as completed
   */
  async completeBatch(batchId: string, status: 'COMPLETED' | 'ERROR' = 'COMPLETED'): Promise<void> {
    try {
      await withConnection(async (conn) => {
        await conn.execute(
          `UPDATE ATTR_MGR.AI_BATCH_PROGRESS 
           SET STATUS = :status, 
               COMPLETED_AT = CURRENT_TIMESTAMP,
               CURRENT_STYLE_ID = NULL
           WHERE BATCH_ID = :batchId`,
          { batchId, status }
        );
        await conn.commit();
      });
      
      logger.info('Batch completed', { batchId, status });
    } catch (e: any) {
      logger.error('Failed to complete batch', { batchId, error: e.message });
    }
  }

  /**
   * Get current batch progress
   */
  async getProgress(batchId: string): Promise<BatchProgress | null> {
    try {
      return await withConnection(async (conn) => {
        const result = await conn.execute(
          `SELECT BATCH_ID, TENANT_ID, BUSINESS_UNIT_ID, TOTAL_ITEMS,
                  PROCESSED_ITEMS, SUCCESS_COUNT, ERROR_COUNT, STATUS,
                  CURRENT_STYLE_ID, STARTED_AT, COMPLETED_AT
           FROM ATTR_MGR.AI_BATCH_PROGRESS
           WHERE BATCH_ID = :batchId`,
          { batchId },
          { outFormat: 4002 } // OUT_FORMAT_OBJECT
        );
        
        const row = result.rows?.[0] as any;
        if (!row) return null;
        
        return {
          batchId: row.BATCH_ID,
          tenantId: row.TENANT_ID,
          businessUnitId: row.BUSINESS_UNIT_ID,
          totalItems: row.TOTAL_ITEMS,
          processedItems: row.PROCESSED_ITEMS,
          successCount: row.SUCCESS_COUNT,
          errorCount: row.ERROR_COUNT,
          status: row.STATUS,
          currentStyleId: row.CURRENT_STYLE_ID,
          startedAt: row.STARTED_AT,
          completedAt: row.COMPLETED_AT
        };
      });
    } catch (e: any) {
      logger.error('Failed to get batch progress', { batchId, error: e.message });
      return null;
    }
  }

  /**
   * Get active batches for a tenant
   */
  async getActiveBatches(tenantId: string, businessUnitId?: number): Promise<BatchProgress[]> {
    try {
      return await withConnection(async (conn) => {
        const buFilter = businessUnitId ? 'AND BUSINESS_UNIT_ID = :bu' : '';
        const result = await conn.execute(
          `SELECT BATCH_ID, TENANT_ID, BUSINESS_UNIT_ID, TOTAL_ITEMS,
                  PROCESSED_ITEMS, SUCCESS_COUNT, ERROR_COUNT, STATUS,
                  CURRENT_STYLE_ID, STARTED_AT, COMPLETED_AT
           FROM ATTR_MGR.AI_BATCH_PROGRESS
           WHERE TENANT_ID = :tenant 
             AND STATUS IN ('PENDING', 'RUNNING')
             ${buFilter}
           ORDER BY CREATED_AT DESC`,
          businessUnitId ? { tenant: tenantId, bu: businessUnitId } : { tenant: tenantId },
          { outFormat: 4002 }
        );
        
        return (result.rows || []).map((row: any) => ({
          batchId: row.BATCH_ID,
          tenantId: row.TENANT_ID,
          businessUnitId: row.BUSINESS_UNIT_ID,
          totalItems: row.TOTAL_ITEMS,
          processedItems: row.PROCESSED_ITEMS,
          successCount: row.SUCCESS_COUNT,
          errorCount: row.ERROR_COUNT,
          status: row.STATUS,
          currentStyleId: row.CURRENT_STYLE_ID,
          startedAt: row.STARTED_AT,
          completedAt: row.COMPLETED_AT
        }));
      });
    } catch (e: any) {
      logger.error('Failed to get active batches', { tenantId, error: e.message });
      return [];
    }
  }
}

export const batchProgressService = new BatchProgressService();
