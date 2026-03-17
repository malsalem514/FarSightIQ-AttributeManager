/**
 * Business Units API
 * 
 * Fetch available business units from database
 */

import { Router, Request, Response } from 'express';
import oracledb from 'oracledb';
import { withConnection } from '../services/oracle-pool.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../middleware/oracle-error-handler.js';

const router = Router();

/**
 * GET /api/business-units
 * 
 * Returns list of available business units with product counts
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const businessUnits = await withConnection(async (conn) => {
      // SSOT: Get active tenant to filter cache counts
      let tenantId = 'DEV';
      try {
        const res = await conn.execute(`SELECT env_id FROM APP_ENVIRONMENTS WHERE is_active = 'Y' AND ROWNUM = 1`);
        tenantId = (res.rows?.[0] as any)?.[0] || (res.rows?.[0] as any)?.ENV_ID || 'DEV';
      } catch (e) { /* fallback to DEV */ }

        // 1. Definitively find which BUs exist in the remote system (SSOT Pattern)
        logger.info(`Performing BU discovery via synonyms for tenant ${tenantId}...`);
        
        let remoteBUs: any[] = [];
        try {
          // Optimization: Try BUSINESS_UNITS table first (O(1))
          const buRes = await conn.execute(
            `SELECT BUSINESS_UNIT_ID FROM BUSINESS_UNITS`,
            {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          
          const rows = buRes.rows as any[];
          
          for (const row of rows) {
            remoteBUs.push({
              id: row.BUSINESS_UNIT_ID,
              name: '', // Just ID initially
              productCount: 0
            });
          }
          
          // Dynamic name discovery
          try {
            const namesRes = await conn.execute(`SELECT BUSINESS_UNIT_ID, NAME FROM BUSINESS_UNITS`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            const nameMap = new Map();
            (namesRes.rows as any[]).forEach(r => nameMap.set(r.BUSINESS_UNIT_ID, r.NAME));
            remoteBUs.forEach(bu => { if (nameMap.has(bu.id)) bu.name = nameMap.get(bu.id); });
          } catch (e) {
            try {
              const namesRes = await conn.execute(`SELECT BUSINESS_UNIT_ID, DESCRIPTION FROM BUSINESS_UNITS`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
              const nameMap = new Map();
              (namesRes.rows as any[]).forEach(r => nameMap.set(r.BUSINESS_UNIT_ID, r.DESCRIPTION));
              remoteBUs.forEach(bu => { if (nameMap.has(bu.id)) bu.name = nameMap.get(bu.id); });
            } catch (e2) { /* keep defaults */ }
          }
        
        logger.info(`Discovered ${remoteBUs.length} BUs via BUSINESS_UNITS synonym.`);
      } catch (e) {
        // Fallback: Scan STYLES table (O(N))
        logger.warn('BUSINESS_UNITS synonym failed. Falling back to STYLES scan...');
        const remoteResult = await conn.execute(
          `SELECT DISTINCT BUSINESS_UNIT_ID FROM STYLES`,
          {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        remoteBUs = remoteResult.rows?.map((r: any) => ({
          id: r.BUSINESS_UNIT_ID,
          name: '', 
          productCount: 0
        })) || [];
      }
      
      if (remoteBUs.length === 0) {
        logger.warn('No BUs found in remote system.');
        return [];
      }

      // 2. Get counts from our local cache for whatever has finished syncing
      const cacheResult = await conn.execute(
        `SELECT BUSINESS_UNIT_ID, COUNT(DISTINCT STYLE_ID) AS PRODUCT_COUNT
         FROM CATALOG_CACHE_SHADOW 
         WHERE TENANT_ID = :tenant
         GROUP BY BUSINESS_UNIT_ID`,
        { tenant: tenantId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const countMap = new Map();
      (cacheResult.rows as any[] || []).forEach(r => countMap.set(r.BUSINESS_UNIT_ID, r.PRODUCT_COUNT));

      // 3. Merge: Remote list is the SSOT, Cache provides the numbers
      return remoteBUs.map(bu => ({
        ...bu,
        productCount: countMap.get(bu.id) || 0
      })).sort((a, b) => a.id - b.id);
    });

    return res.json({
      success: true,
      data: businessUnits
    });
  } catch (error: any) {
    const isDbLinkError = error.message.includes('MERCH_REMOTE') || 
                         error.message.includes('ORA-02063') || 
                         error.message.includes('ORA-02019');
    
    logger.error('Error fetching business units', { 
      error: error.message,
      isDbLinkError 
    });

    if (isDbLinkError) {
      return res.status(200).json({
        success: false,
        data: [],
        error: { 
          code: 'DB_LINK_ERROR', 
          message: 'Merch ERP connection (DB Link) is invalid or requires credentials. Please go to Admin Settings to reconnect.',
          isActionable: true
        }
      });
    }

    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
}));

export default router;

