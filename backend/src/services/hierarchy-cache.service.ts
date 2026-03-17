/**
 * Hierarchy Cache Service - Thin wrapper for PL/SQL hierarchy cache procedures.
 * 
 * This is a THIN wrapper around ATTR_MANAGER_PKG hierarchy cache procedures.
 * All business logic lives in PL/SQL - this file only handles oracledb calls.
 * 
 * Oracle Best Practices:
 * - All logic in PL/SQL (not Node.js)
 * - SYS_REFCURSOR for result sets
 * - OUT parameters for scalar values
 * - Connection pooling via withConnection
 */

import oracledb from 'oracledb';
import { withConnection } from './oracle-pool.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface HierarchyRow {
  GRP_ID: string;
  GRP_DESCR: string;
  DEPT_ID: string;
  DEPT_NAME: string;
  CLASS_ID: string;
  CLASS_DESCR: string;
  SUBCLASS_ID: string;
  SUBCLASS_DESCR: string;
  LOADED_AT?: Date;
  LOADED_BY?: string;
  STATUS?: string;
}

export interface HierarchyData {
  groups: Record<string, string>;      // id → description
  departments: Record<string, string>; // id → name
  classes: Record<string, string>;     // id → description
  subclasses: Record<string, string>;  // id → description
}

export interface FlatHierarchyItem {
  departmentId: string;
  departmentName: string;
  classId: string;
  className: string;
  subclassId: string;
  subclassName: string;
}

export interface LoadHierarchyResult {
  success: boolean;
  business_unit_id: number;
  rows_loaded: number;
  stats: {
    unique_groups: number;
    unique_departments: number;
    unique_classes: number;
    unique_subclasses: number;
    duration_ms: number;
    loaded_at: string;
  };
}

export interface CacheStats {
  business_unit_id: number;
  loaded_at: Date;
  loaded_by: string;
  total_rows: number;
  unique_groups: number;
  unique_departments: number;
  unique_classes: number;
  unique_subclasses: number;
  load_duration_ms: number;
  age_seconds: number;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class HierarchyCacheService {
  /**
   * Load hierarchy cache for a specific business unit.
   * Calls PL/SQL: ATTR_MANAGER_PKG.load_hierarchy_cache()
   * 
   * @param businessUnitId - Business unit ID
   * @returns Load result with statistics
   */
  async loadCache(businessUnitId: number): Promise<LoadHierarchyResult> {
    return withConnection(async (conn) => {
      logger.info('Loading hierarchy cache', { business_unit_id: businessUnitId });

      const result = await conn.execute(
        `BEGIN
          ATTR_MANAGER_PKG.load_hierarchy_cache(
            p_business_unit_id => :buId,
            p_rows_loaded => :rowsLoaded,
            p_stats_json => :statsJson
          );
        END;`,
        {
          buId: businessUnitId,
          rowsLoaded: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          statsJson: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
        }
      );

      const rowsLoaded = (result.outBinds as any)?.rowsLoaded || 0;
      const statsJson = (result.outBinds as any)?.statsJson || '{}';
      const stats = JSON.parse(statsJson);

      logger.info('Hierarchy cache loaded', {
        business_unit_id: businessUnitId,
        rows_loaded: rowsLoaded,
        unique_groups: stats.unique_groups,
        unique_departments: stats.unique_departments,
      });

      return {
        success: true,
        business_unit_id: businessUnitId,
        rows_loaded: rowsLoaded,
        stats: {
          unique_groups: stats.unique_groups || 0,
          unique_departments: stats.unique_departments || 0,
          unique_classes: stats.unique_classes || 0,
          unique_subclasses: stats.unique_subclasses || 0,
          duration_ms: stats.duration_ms || 0,
          loaded_at: stats.loaded_at || new Date().toISOString(),
        },
      };
    });
  }

  /**
   * Get hierarchy cache data with TTL check.
   * Calls PL/SQL: ATTR_MANAGER_PKG.get_hierarchy_cache()
   * 
   * @param businessUnitId - Business unit ID
   * @param ttlSeconds - Cache TTL in seconds (default: 3600)
   * @returns Hierarchy data formatted for LLM
   */
  async getCache(businessUnitId: number, ttlSeconds: number = 3600): Promise<HierarchyData> {
    return withConnection(async (conn) => {
      logger.debug('Getting hierarchy cache', { business_unit_id: businessUnitId });

      const result = await conn.execute(
        `BEGIN
          ATTR_MANAGER_PKG.get_hierarchy_cache(
            p_business_unit_id => :buId,
            p_ttl_seconds => :ttl,
            p_result => :cursor
          );
        END;`,
        {
          buId: businessUnitId,
          ttl: ttlSeconds,
          cursor: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR },
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT } // ✅ FIX: Must set outFormat for cursor results!
      );

      const resultSet = (result.outBinds as any)?.cursor as oracledb.ResultSet<HierarchyRow>;
      const rows = await resultSet.getRows(10000); // Max 10k rows
      await resultSet.close();

      // Check if cache is expired/missing
      if (rows.length === 0 || rows[0].STATUS === 'CACHE_EXPIRED_OR_MISSING') {
        logger.warn('Hierarchy cache expired or missing', {
          business_unit_id: businessUnitId,
          rows_length: rows.length,
          status: rows[0]?.STATUS,
        });
        return {
          groups: {},
          departments: {},
          classes: {},
          subclasses: {},
        };
      }

      // Format into hierarchy structure
      const hierarchy = this.formatHierarchy(rows);

      logger.debug('Hierarchy cache retrieved', {
        business_unit_id: businessUnitId,
        groups: Object.keys(hierarchy.groups).length,
        departments: Object.keys(hierarchy.departments).length,
        classes: Object.keys(hierarchy.classes).length,
        subclasses: Object.keys(hierarchy.subclasses).length,
      });

      return hierarchy;
    });
  }

  /**
   * Check if hierarchy cache is valid (not expired).
   * Calls PL/SQL: ATTR_MANAGER_PKG.is_hierarchy_cache_valid()
   * 
   * @param businessUnitId - Business unit ID
   * @param ttlSeconds - Cache TTL in seconds
   * @returns true if cache is valid, false otherwise
   */
  async isCacheValid(businessUnitId: number, ttlSeconds: number = 3600): Promise<boolean> {
    return withConnection(async (conn) => {
      const result = await conn.execute(
        `SELECT ATTR_MANAGER_PKG.is_hierarchy_cache_valid(:buId, :ttl) AS is_valid FROM DUAL`,
        {
          buId: businessUnitId,
          ttl: ttlSeconds,
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const isValid = (result.rows as any)?.[0]?.IS_VALID === 'Y';

      logger.debug('Hierarchy cache validity check', {
        business_unit_id: businessUnitId,
        is_valid: isValid,
        raw_value: (result.rows as any)?.[0]?.IS_VALID,
      });

      return isValid;
    });
  }

  /**
   * Get hierarchy cache statistics.
   * Calls PL/SQL: ATTR_MANAGER_PKG.get_hierarchy_cache_stats()
   * 
   * @param businessUnitId - Business unit ID (null = all BUs)
   * @returns Array of cache statistics
   */
  async getStats(businessUnitId?: number): Promise<CacheStats[]> {
    return withConnection(async (conn) => {
      const result = await conn.execute(
        `BEGIN
          ATTR_MANAGER_PKG.get_hierarchy_cache_stats(
            p_business_unit_id => :buId,
            p_result => :cursor
          );
        END;`,
        {
          buId: businessUnitId || null,
          cursor: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR },
        }
      );

      const resultSet = (result.outBinds as any)?.cursor as oracledb.ResultSet<any>;
      const rows = await resultSet.getRows(100); // Max 100 stats records
      await resultSet.close();

      return rows.map((row) => ({
        business_unit_id: row.BUSINESS_UNIT_ID,
        loaded_at: row.LOADED_AT,
        loaded_by: row.LOADED_BY,
        total_rows: row.TOTAL_ROWS,
        unique_groups: row.UNIQUE_GROUPS,
        unique_departments: row.UNIQUE_DEPARTMENTS,
        unique_classes: row.UNIQUE_CLASSES,
        unique_subclasses: row.UNIQUE_SUBCLASSES,
        load_duration_ms: row.LOAD_DURATION_MS,
        age_seconds: row.AGE_SECONDS,
      }));
    });
  }

  /**
   * Clear hierarchy cache.
   * Calls PL/SQL: ATTR_MANAGER_PKG.clear_hierarchy_cache()
   * 
   * @param businessUnitId - Business unit ID (null = all BUs)
   * @returns Number of rows deleted
   */
  async clearCache(businessUnitId?: number): Promise<number> {
    return withConnection(async (conn) => {
      logger.info('Clearing hierarchy cache', { business_unit_id: businessUnitId });

      const result = await conn.execute<{ rows_deleted: number }>(
        `BEGIN
          ATTR_MANAGER_PKG.clear_hierarchy_cache(
            p_business_unit_id => :buId,
            p_rows_deleted => :rowsDeleted
          );
        END;`,
        {
          buId: businessUnitId || null,
          rowsDeleted: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        }
      );

      const rowsDeleted = result.outBinds?.rows_deleted || 0;

      logger.info('Hierarchy cache cleared', {
        business_unit_id: businessUnitId,
        rows_deleted: rowsDeleted,
      });

      return rowsDeleted;
    });
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Format raw hierarchy rows into structured hierarchy data.
   * Groups rows by level (groups, departments, classes, subclasses).
   * 
   * @param rows - Raw rows from PL/SQL
   * @returns Formatted hierarchy data
   */
  private formatHierarchy(rows: HierarchyRow[]): HierarchyData {
    const hierarchy: HierarchyData = {
      groups: {},
      departments: {},
      classes: {},
      subclasses: {},
    };

    for (const row of rows) {
      // Skip 'N/A' groups (placeholder for MERCH's 3-level hierarchy)
      if (row.GRP_ID && row.GRP_DESCR && row.GRP_ID !== 'N/A' && !hierarchy.groups[row.GRP_ID]) {
        hierarchy.groups[row.GRP_ID] = row.GRP_DESCR;
      }

      // Add department (if not already added)
      if (row.DEPT_ID && row.DEPT_NAME && !hierarchy.departments[row.DEPT_ID]) {
        hierarchy.departments[row.DEPT_ID] = row.DEPT_NAME;
      }

      // Add class (if not already added)
      if (row.CLASS_ID && row.CLASS_DESCR && !hierarchy.classes[row.CLASS_ID]) {
        hierarchy.classes[row.CLASS_ID] = row.CLASS_DESCR;
      }

      // Add subclass (if not already added)
      if (row.SUBCLASS_ID && row.SUBCLASS_DESCR && !hierarchy.subclasses[row.SUBCLASS_ID]) {
        hierarchy.subclasses[row.SUBCLASS_ID] = row.SUBCLASS_DESCR;
      }
    }

    return hierarchy;
  }
}

// Singleton instance
export const hierarchyCacheService = new HierarchyCacheService();

