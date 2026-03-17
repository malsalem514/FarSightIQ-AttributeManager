/**
 * Characteristic Types Service
 * 
 * CRUD for characteristic types (~80 LOC)
 */

import { withConnection } from '../oracle-pool.js';
import { QUERY_OPTIONS, DEFAULT_SUB_TYPE } from './constants.js';
import type { CharType, CreateCharTypeInput } from '../../types/index.js';

/** Transform Oracle row to CharType */
function transformType(businessUnitId: number, row: any): CharType {
  return {
    businessUnitId,
    typeId: row.CHARACTERISTIC_TYPE_ID,
    description: row.DESCRIPTION || '',
    subType: row.SUB_TYPE || DEFAULT_SUB_TYPE,
    valueCount: row.VALUE_COUNT || 0,
    usageCount: 0
  };
}

/** Get all characteristic types for a business unit */
export async function getTypes(businessUnitId: number, subType?: string): Promise<CharType[]> {
  return withConnection(async (conn) => {
    let sql = `
      SELECT ct.characteristic_type_id, ct.description, ct.sub_type,
             COUNT(cv.characteristic_value_id) as value_count
      FROM characteristic_types ct
      LEFT JOIN characteristic_values cv 
        ON ct.business_unit_id = cv.business_unit_id 
        AND ct.characteristic_type_id = cv.characteristic_type_id
      WHERE ct.business_unit_id = :buId
    `;
    const binds: any = { buId: businessUnitId };
    
    if (subType) {
      sql += ` AND ct.sub_type = :subType`;
      binds.subType = subType;
    }
    
    sql += ` GROUP BY ct.characteristic_type_id, ct.description, ct.sub_type
             ORDER BY ct.description`;

    try {
      const result = await conn.execute(sql, binds, QUERY_OPTIONS);
      return (result.rows || []).map((row) => transformType(businessUnitId, row));
    } catch (error: any) {
      // Return empty if MERCH_REMOTE DB link is unavailable
      if (error.errorNum === 12545 || error.errorNum === 942) return [];
      throw error;
    }
  });
}

/** Create a new characteristic type */
export async function createType(input: CreateCharTypeInput): Promise<CharType> {
  const typeId = input.typeId.toUpperCase();
  
  try {
    await withConnection(async (conn) => {
      await conn.execute(
        `INSERT INTO characteristic_types (business_unit_id, characteristic_type_id, description, sub_type)
         VALUES (:buId, :typeId, :description, :subType)`,
        { buId: input.businessUnitId, typeId, description: input.description, subType: input.subType },
        { autoCommit: true }
      );
    });

    return { businessUnitId: input.businessUnitId, typeId, description: input.description, subType: input.subType, valueCount: 0, usageCount: 0 };
  } catch (error: any) {
    if (error.errorNum === 1) throw new Error(`Type '${typeId}' already exists`);
    throw error;
  }
}

/** Update a characteristic type */
export async function updateType(businessUnitId: number, typeId: string, data: { description?: string }): Promise<CharType> {
  const result = await withConnection(async (conn) => {
    return conn.execute(
      `UPDATE characteristic_types SET description = :description WHERE business_unit_id = :buId AND characteristic_type_id = :typeId`,
      { buId: businessUnitId, typeId, description: data.description },
      { autoCommit: true }
    );
  });

  if (result.rowsAffected === 0) throw new Error(`Type '${typeId}' not found`);
  return { businessUnitId, typeId, description: data.description || '', subType: DEFAULT_SUB_TYPE, valueCount: 0, usageCount: 0 };
}

/** Delete a characteristic type */
export async function deleteType(businessUnitId: number, typeId: string): Promise<void> {
  try {
    await withConnection(async (conn) => {
      await conn.execute(
        `DELETE FROM characteristic_types WHERE business_unit_id = :buId AND characteristic_type_id = :typeId`,
        { buId: businessUnitId, typeId },
        { autoCommit: true }
      );
    });
  } catch (error: any) {
    if (error.errorNum === 2292) throw new Error(`Type '${typeId}' has associated values. Delete values first.`);
    throw error;
  }
}

