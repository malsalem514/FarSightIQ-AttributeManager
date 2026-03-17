/**
 * Mapping Rules Service
 * 
 * CRUD for AI→ERP mapping rules (~75 LOC)
 */

import oracledb from 'oracledb';
import { withConnection } from '../oracle-pool.js';
import { QUERY_OPTIONS, DEFAULT_CREATED_BY, DEFAULT_CONFIDENCE } from './constants.js';
import type { MappingRule, CreateMappingInput } from '../../types/index.js';

/** Transform Oracle row to MappingRule */
function transformMapping(businessUnitId: number, row: any): MappingRule {
  return {
    mappingId: row.MAPPING_ID,
    businessUnitId,
    llmInput: row.LLM_INPUT,
    targetTypeId: row.TARGET_TYPE_ID,
    targetValueId: row.TARGET_VALUE_ID,
    targetValueDesc: row.TARGET_VALUE_DESC || '',
    confidenceThreshold: row.CONFIDENCE_THRESHOLD || DEFAULT_CONFIDENCE,
    isActive: row.IS_ACTIVE === 'Y',
    createdBy: row.CREATED_BY || '',
    createdDate: row.CREATED_AT?.toISOString() || ''
  };
}

/** Get all mapping rules for a business unit */
export async function getMappings(businessUnitId: number): Promise<MappingRule[]> {
  return withConnection(async (conn) => {
    // Try with characteristic_values join first, fall back to local-only query
    // if MERCH_REMOTE DB link is unavailable
    let result;
    try {
      result = await conn.execute(
        `SELECT m.mapping_id, m.llm_input, m.target_type_id, m.target_value_id,
                cv.description as target_value_desc, m.confidence_threshold, 
                m.is_active, m.created_by, m.created_at
         FROM llm_char_mappings m
         LEFT JOIN characteristic_values cv 
           ON m.business_unit_id = cv.business_unit_id 
           AND m.target_type_id = cv.characteristic_type_id
           AND m.target_value_id = cv.characteristic_value_id
         WHERE m.business_unit_id = :buId
         ORDER BY m.llm_input`,
        { buId: businessUnitId },
        QUERY_OPTIONS
      );
    } catch (dbLinkError: any) {
      // Fallback: query local table only (MERCH_REMOTE unavailable)
      result = await conn.execute(
        `SELECT mapping_id, llm_input, target_type_id, target_value_id,
                NULL as target_value_desc, confidence_threshold, 
                is_active, created_by, created_at
         FROM llm_char_mappings
         WHERE business_unit_id = :buId
         ORDER BY llm_input`,
        { buId: businessUnitId },
        QUERY_OPTIONS
      );
    }
    return (result.rows || []).map((row) => transformMapping(businessUnitId, row));
  });
}

/** Create a new mapping rule */
export async function createMapping(input: CreateMappingInput): Promise<MappingRule> {
  try {
    const result = await withConnection(async (conn) => {
      return conn.execute(
        `INSERT INTO llm_char_mappings (business_unit_id, llm_input, target_type_id, target_value_id, confidence_threshold, is_active, created_by, created_at)
         VALUES (:buId, :llmInput, :typeId, :valueId, :threshold, 'Y', :createdBy, SYSTIMESTAMP)
         RETURNING mapping_id INTO :mappingId`,
        {
          buId: input.businessUnitId, llmInput: input.llmInput, typeId: input.targetTypeId, valueId: input.targetValueId,
          threshold: input.confidenceThreshold || DEFAULT_CONFIDENCE, createdBy: DEFAULT_CREATED_BY,
          mappingId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        },
        { autoCommit: true }
      );
    });

    const mappingId = (result.outBinds as any)?.mappingId?.[0] || 0;
    return {
      mappingId, businessUnitId: input.businessUnitId, llmInput: input.llmInput, targetTypeId: input.targetTypeId,
      targetValueId: input.targetValueId, targetValueDesc: '', confidenceThreshold: input.confidenceThreshold || DEFAULT_CONFIDENCE,
      isActive: true, createdBy: DEFAULT_CREATED_BY, createdDate: new Date().toISOString()
    };
  } catch (error: any) {
    if (error.errorNum === 1) throw new Error(`Mapping for '${input.llmInput}' already exists`);
    throw error;
  }
}

/** Delete a mapping rule */
export async function deleteMapping(mappingId: number): Promise<void> {
  const result = await withConnection(async (conn) => {
    return conn.execute(`DELETE FROM llm_char_mappings WHERE mapping_id = :mappingId`, { mappingId }, { autoCommit: true });
  });
  if (result.rowsAffected === 0) throw new Error(`Mapping ${mappingId} not found`);
}

/** Get mapping analytics/coverage stats */
export async function getMappingStats(businessUnitId: number): Promise<{
  totalRules: number;
  activeRules: number;
  typeCoverage: number;
  byType: Array<{ typeId: string; typeDesc: string; ruleCount: number; valueCount: number; coverage: number }>;
  topMappings: Array<{ llmInput: string; targetTypeId: string; targetValueId: string; hitCount: number }>;
  recentUnmapped: Array<{ llmValue: string; count: number; lastSeen: string }>;
}> {
  return withConnection(async (conn) => {
    // Total rules
    const rulesResult = await conn.execute(
      `SELECT COUNT(*) as total, SUM(CASE WHEN is_active = 'Y' THEN 1 ELSE 0 END) as active
       FROM llm_char_mappings WHERE business_unit_id = :buId`,
      { buId: businessUnitId }
    );
    const rulesRow = (rulesResult.rows as any)?.[0] || {};
    
    // Coverage by type
    const coverageResult = await conn.execute(
      `SELECT ct.characteristic_type_id, ct.description,
              COUNT(DISTINCT m.target_value_id) as rule_count,
              (SELECT COUNT(*) FROM characteristic_values cv 
               WHERE cv.business_unit_id = ct.business_unit_id 
               AND cv.characteristic_type_id = ct.characteristic_type_id) as value_count
       FROM characteristic_types ct
       LEFT JOIN llm_char_mappings m 
         ON ct.business_unit_id = m.business_unit_id 
         AND ct.characteristic_type_id = m.target_type_id AND m.is_active = 'Y'
       WHERE ct.business_unit_id = :buId
       GROUP BY ct.characteristic_type_id, ct.description, ct.business_unit_id
       ORDER BY ct.characteristic_type_id`,
      { buId: businessUnitId }
    );
    
    const byType = ((coverageResult.rows || []) as any[]).map(row => ({
      typeId: row.CHARACTERISTIC_TYPE_ID,
      typeDesc: row.DESCRIPTION || '',
      ruleCount: row.RULE_COUNT || 0,
      valueCount: row.VALUE_COUNT || 0,
      coverage: row.VALUE_COUNT > 0 ? Math.round((row.RULE_COUNT / row.VALUE_COUNT) * 100) : 0
    }));
    
    const typesWithRules = byType.filter(t => t.ruleCount > 0).length;
    const typeCoverage = byType.length > 0 ? Math.round((typesWithRules / byType.length) * 100) : 0;
    
    return {
      totalRules: rulesRow.TOTAL || 0,
      activeRules: rulesRow.ACTIVE || 0,
      typeCoverage,
      byType,
      topMappings: [], // Would need usage tracking table
      recentUnmapped: [] // Would need extraction log
    };
  });
}

/** Export mappings as JSON for backup/import */
export async function exportMappings(businessUnitId: number): Promise<MappingRule[]> {
  return getMappings(businessUnitId);
}

/** Import mappings from JSON (bulk insert) */
export async function importMappings(businessUnitId: number, mappings: Omit<CreateMappingInput, 'businessUnitId'>[]): Promise<{ imported: number; skipped: number; errors: string[] }> {
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  
  for (const m of mappings) {
    try {
      await createMapping({ ...m, businessUnitId });
      imported++;
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        skipped++;
      } else {
        errors.push(`${m.llmInput}: ${error.message}`);
      }
    }
  }
  
  return { imported, skipped, errors };
}

