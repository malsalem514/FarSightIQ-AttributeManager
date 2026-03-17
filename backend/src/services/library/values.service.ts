/**
 * Characteristic Values Service
 * 
 * CRUD for characteristic values (~70 LOC)
 */

import { withConnection } from '../oracle-pool.js';
import { QUERY_OPTIONS, DEFAULT_SUB_TYPE, DEFAULT_ORIGIN } from './constants.js';
import type { CharValue, CreateCharValueInput } from '../../types/index.js';

/** Transform Oracle row to CharValue */
function transformValue(businessUnitId: number, row: any): CharValue {
  return {
    businessUnitId,
    typeId: row.CHARACTERISTIC_TYPE_ID,
    valueId: row.CHARACTERISTIC_VALUE_ID,
    description: row.DESCRIPTION || ''
  };
}

/** Get characteristic values, optionally filtered by type */
export async function getValues(businessUnitId: number, typeId?: string): Promise<CharValue[]> {
  return withConnection(async (conn) => {
    let sql = `SELECT characteristic_type_id, characteristic_value_id, description FROM characteristic_values WHERE business_unit_id = :buId`;
    const binds: any = { buId: businessUnitId };
    
    if (typeId) {
      sql += ` AND characteristic_type_id = :typeId`;
      binds.typeId = typeId;
    }
    
    sql += ` ORDER BY characteristic_type_id, description`;
    
    try {
      const result = await conn.execute(sql, binds, QUERY_OPTIONS);
      return (result.rows || []).map((row) => transformValue(businessUnitId, row));
    } catch (error: any) {
      // Return empty if MERCH_REMOTE DB link is unavailable
      if (error.errorNum === 12545 || error.errorNum === 942) return [];
      throw error;
    }
  });
}

/** Create a new characteristic value */
export async function createValue(input: CreateCharValueInput): Promise<CharValue> {
  const valueId = input.valueId.toUpperCase();
  
  try {
    await withConnection(async (conn) => {
      await conn.execute(
        `INSERT INTO characteristic_values (business_unit_id, characteristic_type_id, characteristic_value_id, description, char_ty_sub_type, origin)
         VALUES (:buId, :typeId, :valueId, :description, :subType, :origin)`,
        { buId: input.businessUnitId, typeId: input.typeId, valueId, description: input.description, subType: DEFAULT_SUB_TYPE, origin: input.origin || DEFAULT_ORIGIN },
        { autoCommit: true }
      );
    });

    return { businessUnitId: input.businessUnitId, typeId: input.typeId, valueId, description: input.description };
  } catch (error: any) {
    if (error.errorNum === 2291) throw new Error(`Type '${input.typeId}' does not exist`);
    if (error.errorNum === 1) throw new Error(`Value '${valueId}' already exists for type '${input.typeId}'`);
    throw error;
  }
}

/** Delete a characteristic value */
export async function deleteValue(businessUnitId: number, typeId: string, valueId: string): Promise<void> {
  try {
    await withConnection(async (conn) => {
      await conn.execute(
        `DELETE FROM characteristic_values WHERE business_unit_id = :buId AND characteristic_type_id = :typeId AND characteristic_value_id = :valueId`,
        { buId: businessUnitId, typeId, valueId },
        { autoCommit: true }
      );
    });
  } catch (error: any) {
    if (error.errorNum === 2292) throw new Error(`Value '${valueId}' is in use and cannot be deleted`);
    throw error;
  }
}

