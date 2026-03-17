/**
 * Autocomplete Service
 * 
 * Provides fast style/description suggestions from CATALOG_CACHE.
 */

import oracledb from 'oracledb';
import { withConnection } from './oracle-pool.js';
import { logger } from '../utils/logger.js';

export class AutocompleteService {
  /**
   * Get autocomplete suggestions
   */
  async getSuggestions(businessUnitId: number, query: string, limit = 10) {
    if (!query || query.length < 2) return [];

    try {
      return await withConnection(async (conn) => {
        // Get active tenant
        let tenantId = 'DEV';
        try {
          const res = await conn.execute(`SELECT env_id FROM APP_ENVIRONMENTS WHERE is_active = 'Y' AND ROWNUM = 1`);
          tenantId = (res.rows?.[0] as any)?.[0] || (res.rows?.[0] as any)?.ENV_ID || 'DEV';
        } catch (e) { /* fallback */ }

        const result = await conn.execute(
          `SELECT style_id, description
           FROM CATALOG_CACHE_SHADOW
           WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :buId
             AND (UPPER(STYLE_ID) LIKE UPPER(:query) || '%' 
                  OR UPPER(DESCRIPTION) LIKE '%' || UPPER(:query) || '%')
           ORDER BY CASE WHEN UPPER(STYLE_ID) LIKE UPPER(:query) || '%' THEN 1 ELSE 2 END, STYLE_ID
           FETCH FIRST :limit ROWS ONLY`,
          { tenant: tenantId, buId: businessUnitId, query, limit },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        return (result.rows || []).map((r: any) => ({
          id: r.STYLE_ID,
          text: `${r.STYLE_ID} - ${r.DESCRIPTION || ''}`
        }));
      });
    } catch (error: any) {
      logger.error('Autocomplete failed', { error: error.message, query });
      return [];
    }
  }
}

let instance: AutocompleteService | null = null;

export function getAutocompleteService() {
  if (!instance) instance = new AutocompleteService();
  return instance;
}

