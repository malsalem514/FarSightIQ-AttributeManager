/**
 * Sync Service (Boring Vanilla)
 * 
 * Queue approved attributes to PENDING_SYNCS table for later export.
 * STANDALONE MODE: We don't directly modify MERCH - we stage changes locally.
 */

import { logger } from '../utils/logger.js';
import * as syncDb from './sync/sync-db.js';
import { withConnection } from './oracle-pool.js';
import { SettingsService } from './settings.service.js';
import type { SyncStyle, SyncResult, CompletenessResult } from '../types/index.js';

interface StyleSyncResult {
  styleId: string;
  colorId: string;
  success: boolean;
  synced: number;
  pendingId?: number;
  error?: string;
}

interface BulkAssignInput {
  styleIds: string[];
  colorId: string;
  characteristics: Array<{ typeId: string; valueId: string }>;
}

export class SyncService {
  /**
   * Queue a single style's changes to PENDING_SYNCS
   * Does NOT directly modify MERCH (read-only via DB Link)
   */
  async syncStyle(businessUnitId: number, style: SyncStyle): Promise<StyleSyncResult> {
    try {
      const syncIds: number[] = [];
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Insert description update if provided
      if (style.longStyleDesc || style.shortStyleDesc) {
        const syncId = await syncDb.insertDescriptionSync({
          batchId,
          businessUnitId,
          styleId: style.styleId,
          colorId: style.colorId || '000',
          longDesc: style.longStyleDesc,
          shortDesc: style.shortStyleDesc
        });
        syncIds.push(syncId);
      }

      // Insert one row per characteristic
      for (const char of style.characteristics) {
        const syncId = await syncDb.insertCharacteristicSync({
          batchId,
          businessUnitId,
          styleId: style.styleId,
          colorId: style.colorId || '000',
          typeId: char.typeId,
          valueId: char.valueId
        });
        syncIds.push(syncId);
      }

      const synced = syncIds.length;
      logger.info(`Sync queued: ${synced} records`, { styleId: style.styleId, batchId });

      return {
        styleId: style.styleId,
        colorId: style.colorId || '000',
        success: true,
        synced,
        pendingId: syncIds[0]
      };
    } catch (error: any) {
      logger.error('Sync failed', { styleId: style.styleId, error: error.message });
      
      return {
        styleId: style.styleId,
        colorId: style.colorId || '000',
        success: false,
        synced: 0,
        error: error.message
      };
    }
  }

  /**
   * Sync multiple styles (bulk)
   */
  async syncBulk(businessUnitId: number, styles: SyncStyle[]): Promise<SyncResult> {
    const results: StyleSyncResult[] = [];
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();

    // 1. Initialize Glass Box
    await withConnection(async (conn) => {
      await conn.execute(
        `MERGE INTO ATTR_MGR.SYNC_PROGRESS target
         USING (SELECT :t as t, :bu as bu, 'STYLE_SYNC' as op FROM DUAL) source
         ON (target.TENANT_ID = source.t AND target.BUSINESS_UNIT_ID = source.bu AND target.OP_NAME = source.op)
         WHEN MATCHED THEN UPDATE SET STATUS = 'RUNNING', TOTAL_RECORDS = :total, PROCESSED = 0, START_TIME = SYSTIMESTAMP, UPDATE_TIME = SYSTIMESTAMP, ERROR_MSG = NULL, CURRENT_ITEM = 'Starting bulk sync...'
         WHEN NOT MATCHED THEN INSERT (TENANT_ID, BUSINESS_UNIT_ID, OP_NAME, STATUS, TOTAL_RECORDS, PROCESSED, CURRENT_ITEM) VALUES (:t, :bu, 'STYLE_SYNC', 'RUNNING', :total, 0, 'Starting bulk sync...')`,
        { t: tenantId, bu: businessUnitId, total: styles.length }
      );
      await conn.commit();
    });

    let processedCount = 0;
    for (const style of styles) {
      // Update progress every style (or batch if needed, but style-by-style gives the "move 1 by 1" feel)
      await withConnection(async (conn) => {
        await conn.execute(
          `UPDATE ATTR_MGR.SYNC_PROGRESS 
           SET PROCESSED = :processed, 
               CURRENT_ITEM = :style,
               UPDATE_TIME = SYSTIMESTAMP
           WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :bu AND OP_NAME = 'STYLE_SYNC'`,
          { processed: processedCount, style: `Syncing ${style.styleId}...`, tenant: tenantId, bu: businessUnitId }
        );
        await conn.commit();
      });

      const result = await this.syncStyle(businessUnitId, style);
      results.push(result);
      processedCount++;
    }

    const synced = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    // Finalize Glass Box
    await withConnection(async (conn) => {
      await conn.execute(
        `UPDATE ATTR_MGR.SYNC_PROGRESS 
         SET STATUS = 'COMPLETED', 
             PROCESSED = :synced,
             CURRENT_ITEM = :msg,
             UPDATE_TIME = SYSTIMESTAMP
         WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :bu AND OP_NAME = 'STYLE_SYNC'`,
        { 
          synced, 
          msg: `Sync complete. ${synced} success, ${failed} failed.`, 
          tenant: tenantId, 
          bu: businessUnitId 
        }
      );
      await conn.commit();
    });

    const errors = results
      .filter(r => !r.success)
      .map(r => ({ styleId: r.styleId, error: r.error || 'Unknown error' }));

    return {
      success: failed === 0,
      synced,
      failed,
      timestamp: new Date().toISOString(),
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Bulk assign same characteristics to multiple styles
   */
  async bulkAssign(businessUnitId: number, input: BulkAssignInput): Promise<SyncResult> {
    const styles: SyncStyle[] = input.styleIds.map(styleId => ({
      styleId,
      colorId: input.colorId,
      characteristics: input.characteristics
    }));

    return this.syncBulk(businessUnitId, styles);
  }

  /**
   * Get diff preview before sync - shows what will change
   */
  async getDiff(
    businessUnitId: number,
    style: SyncStyle
  ): Promise<{
    styleId: string;
    colorId: string;
    descriptions: { field: string; current: string | null; proposed: string }[];
    characteristics: { typeId: string; typeDesc: string; action: 'add' | 'update' | 'unchanged'; current?: string; proposed: string }[];
  }> {
    // Get current descriptions
    const currentStyle = await syncDb.getCurrentStyle(businessUnitId, style.styleId);
    
    const descriptions: any[] = [];
    if (style.longStyleDesc && style.longStyleDesc !== currentStyle.DESCRIPTION) {
      descriptions.push({ field: 'description', current: currentStyle.DESCRIPTION, proposed: style.longStyleDesc });
    }
    if (style.shortStyleDesc && style.shortStyleDesc !== currentStyle.NOTE_1) {
      descriptions.push({ field: 'note_1', current: currentStyle.NOTE_1, proposed: style.shortStyleDesc });
    }
    
    // Get current characteristics
    const currentChars = await syncDb.getCurrentCharacteristics(businessUnitId, style.styleId);
    
    const characteristics: any[] = [];
    for (const char of style.characteristics) {
      const current = currentChars.get(char.typeId);
      if (!current) {
        characteristics.push({ typeId: char.typeId, typeDesc: char.typeId, action: 'add', proposed: char.valueId });
      } else if (current.valueId !== char.valueId) {
        characteristics.push({ typeId: char.typeId, typeDesc: current.typeDesc, action: 'update', current: current.valueId, proposed: char.valueId });
      } else {
        characteristics.push({ typeId: char.typeId, typeDesc: current.typeDesc, action: 'unchanged', current: current.valueId, proposed: char.valueId });
      }
    }
    
    return { styleId: style.styleId, colorId: style.colorId, descriptions, characteristics };
  }

  /**
   * Check completeness against mandatory characteristics for product type
   */
  async checkCompleteness(
    businessUnitId: number,
    styleId: string,
    colorId: string
  ): Promise<CompletenessResult> {
    try {
      // Check if PRODUCT_TYPES table exists (graceful degradation)
      const tableExists = await syncDb.tableExists('PRODUCT_TYPES');

      if (!tableExists) {
        logger.info('PRODUCT_TYPES table not found - returning default completeness', { styleId });
        return {
          styleId,
          productTypeId: 0,
          productTypeName: 'Not Configured',
          mandatoryChars: [],
          completenessPct: 100,
          isSyncReady: true,
          missingCount: 0
        };
      }

      // Get product type for style
      const productType = await syncDb.getProductType(businessUnitId, styleId);
      const productTypeId = productType?.PRODUCT_TYPE_ID || 0;
      const productTypeName = productType?.PRODUCT_TYPE_NAME || 'General';

      // If no product type assigned, return complete (no mandatory chars)
      if (productTypeId === 0) {
        return {
          styleId,
          productTypeId: 0,
          productTypeName: 'General',
          mandatoryChars: [],
          completenessPct: 100,
          isSyncReady: true,
          missingCount: 0
        };
      }

      // Check if mandatory chars table exists
      const mandTableExists = await syncDb.tableExists('PRODUCT_TYPE_MAND_STYLE_CHAR');

      if (!mandTableExists) {
        return {
          styleId,
          productTypeId,
          productTypeName,
          mandatoryChars: [],
          completenessPct: 100,
          isSyncReady: true,
          missingCount: 0
        };
      }

      // Get mandatory characteristics and check presence
      const mandatoryChars = await syncDb.getMandatoryCharacteristics(businessUnitId, styleId, productTypeId);

      const presentCount = mandatoryChars.filter(c => c.isPresent).length;
      const totalMandatory = mandatoryChars.length;
      const completenessPct = totalMandatory > 0 
        ? Math.round((presentCount / totalMandatory) * 100) 
        : 100;

      return {
        styleId,
        productTypeId,
        productTypeName,
        mandatoryChars,
        completenessPct,
        isSyncReady: completenessPct === 100,
        missingCount: totalMandatory - presentCount
      };
    } catch (error: any) {
      // ORA-00942: table or view does not exist - graceful degradation
      if (error.message?.includes('ORA-00942')) {
        logger.warn('Completeness check tables not found - returning default', { styleId, error: error.message });
        return {
          styleId,
          productTypeId: 0,
          productTypeName: 'Not Configured',
          mandatoryChars: [],
          completenessPct: 100,
          isSyncReady: true,
          missingCount: 0
        };
      }
      throw error;
    }
  }
}

// Singleton instance
export const syncService = new SyncService();
