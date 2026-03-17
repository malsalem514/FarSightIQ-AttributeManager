/**
 * Sync Database Operations
 * 
 * Oracle queries for sync staging, diff preview, and completeness checks
 * Pattern: Thin data access layer (no business logic)
 */

import oracledb from 'oracledb';
import { withConnection } from '../oracle-pool.js';
import { logger } from '../../utils/logger.js';

/**
 * Insert style description to pending_syncs and return sync_id
 */
export async function insertDescriptionSync(params: {
  batchId: string;
  businessUnitId: number;
  styleId: string;
  colorId: string;
  longDesc?: string;
  shortDesc?: string;
}): Promise<number> {
  return withConnection(async (conn) => {
    const result = await conn.execute(
      `INSERT INTO pending_syncs (
         batch_id, business_unit_id, style_id, color_id,
         long_description, short_description, action, target_table, 
         status, requested_by
       ) VALUES (
         :batchId, :buId, :styleId, :colorId,
         :longDesc, :shortDesc, 'UPSERT', 'STYLES', 
         'PENDING', 'ATTR_MANAGER_APP'
       ) RETURNING sync_id INTO :syncId`,
      {
        batchId: params.batchId,
        buId: params.businessUnitId,
        styleId: params.styleId,
        colorId: params.colorId,
        longDesc: params.longDesc || null,
        shortDesc: params.shortDesc || null,
        syncId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      }
    );
    return (result.outBinds as any).syncId[0];
  });
}

/**
 * Insert style description to local IRI staging table
 */
export async function insertIriStyleSync(params: {
  jobId: number;
  businessUnitId: number;
  styleId: string;
  description: string;
  vendorId?: string;
  deptId?: string;
  classId?: string;
  subclassId?: string;
}): Promise<void> {
  try {
    return await withConnection(async (conn) => {
      await conn.execute(
        `INSERT INTO IRI_WHSLE_STYLES (
           BUSINESS_UNIT_ID, JOB_ID, STYLE_ID, VENDOR_ID,
           DEPARTMENT_ID, CLASS_ID, SUB_CLASS_ID,
           DESCRIPTION, CREATED_BY, STATUS, PROCESS_STATUS,
           DATE_CREATED, AUTO_MARKDOWNS_IND
         ) VALUES (
           :buId, :jobId, :styleId, :vendorId,
           :deptId, :classId, :subclassId,
           :description, 'ATTR_MGR_APP', 'Y', 'N',
           CURRENT_TIMESTAMP, 'N'
         )`,
        {
          buId: params.businessUnitId,
          jobId: params.jobId,
          styleId: params.styleId,
          vendorId: params.vendorId || null,
          deptId: params.deptId || null,
          classId: params.classId || null,
          subclassId: params.subclassId || null,
          description: params.description.slice(0, 30) // VARCHAR2(30) limit
        },
        { autoCommit: true }
      );
    });
  } catch (e: any) {
    // Demo mode: IRI sync tables may not exist - log and continue
    logger.warn('[Sync] IRI style sync skipped (table may not exist)', { styleId: params.styleId, error: e.message?.slice(0, 50) });
  }
}

/**
 * Insert style foreign description to local IRI staging table
 */
export async function insertIriStyleForeignDescSync(params: {
  jobId: number;
  businessUnitId: number;
  styleId: string;
  languageId?: string;
  description: string;
  webDescription?: string;
  longDescription?: string;
  ticketDescription?: string;
}): Promise<void> {
  try {
    return await withConnection(async (conn) => {
      await conn.execute(
        `INSERT INTO IRI_WHSLE_STYLE_FOREIGN_DESC (
           BUSINESS_UNIT_ID, JOB_ID, STYLE_ID, LANGUAGE_ID,
           DESCRIPTION, WEB_DESCRIPTION, LONG_DESCRIPTION, TICKET_DESCRIPTION,
           CREATED_BY, STATUS, PROCESS_STATUS
         ) VALUES (
           :buId, :jobId, :styleId, :langId,
           :description, :webDesc, :longDesc, :ticketDesc,
           'ATTR_MGR_APP', 'Y', 'N'
         )`,
        {
          buId: params.businessUnitId,
          jobId: params.jobId,
          styleId: params.styleId,
          langId: params.languageId || 'ENG',
          description: params.description.slice(0, 200),
          webDesc: params.webDescription || null,
          longDesc: params.longDescription || null,
          ticketDesc: params.ticketDescription || null
        },
        { autoCommit: true }
      );
    });
  } catch (e: any) {
    logger.warn('[Sync] IRI foreign desc sync skipped', { styleId: params.styleId, error: e.message?.slice(0, 50) });
  }
}

/**
 * Insert characteristic to local IRI staging table
 */
export async function insertIriCharacteristicSync(params: {
  jobId: number;
  businessUnitId: number;
  styleId: string;
  typeId: string;
  valueId: string;
  description?: string;
}): Promise<void> {
  try {
    return await withConnection(async (conn) => {
      await conn.execute(
        `INSERT INTO IRI_WHSLE_STYLE_CHARACTERISTIC (
           BUSINESS_UNIT_ID, JOB_ID, STYLE_ID,
           CHARACTERISTIC_TYPE_ID, CHARACTERISTIC_VALUE_ID,
           CHAR_VALUE_DESCRIPTION, CREATED_BY, STATUS, PROCESS_STATUS
         ) VALUES (
           :buId, :jobId, :styleId,
           :typeId, :valueId,
           :description, 'ATTR_MGR_APP', 'Y', 'N'
         )`,
        {
          buId: params.businessUnitId,
          jobId: params.jobId,
          styleId: params.styleId,
          typeId: params.typeId.slice(0, 5),
          valueId: params.valueId.slice(0, 5),
          description: params.description ? params.description.slice(0, 30) : null
        },
        { autoCommit: true }
      );
    });
  } catch (e: any) {
    logger.warn('[Sync] IRI characteristic sync skipped', { styleId: params.styleId, error: e.message?.slice(0, 50) });
  }
}

/**
 * Insert characteristic to pending_syncs and return sync_id
 */
export async function insertCharacteristicSync(params: {
  batchId: string;
  businessUnitId: number;
  styleId: string;
  colorId: string;
  typeId: string;
  valueId: string;
}): Promise<number> {
  return withConnection(async (conn) => {
    const result = await conn.execute(
      `INSERT INTO pending_syncs (
         batch_id, business_unit_id, style_id, color_id,
         char_type_id, char_value_id, action, target_table, 
         status, requested_by
       ) VALUES (
         :batchId, :buId, :styleId, :colorId,
         :typeId, :valueId, 'UPSERT', 'STYLE_CHARACTERISTICS', 
         'PENDING', 'ATTR_MANAGER_APP'
       ) RETURNING sync_id INTO :syncId`,
      {
        batchId: params.batchId,
        buId: params.businessUnitId,
        styleId: params.styleId,
        colorId: params.colorId,
        typeId: params.typeId,
        valueId: params.valueId,
        syncId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      }
    );
    return (result.outBinds as any).syncId[0];
  });
}

/**
 * Get current style descriptions
 */
export async function getCurrentStyle(businessUnitId: number, styleId: string) {
  return withConnection(async (conn) => {
    const result = await conn.execute(
      `SELECT description, note_1 FROM styles 
       WHERE business_unit_id = :buId AND style_id = :styleId`,
      { buId: businessUnitId, styleId }
    );
    return (result.rows as any)?.[0] || {};
  });
}

/**
 * Get current characteristics for a style
 */
export async function getCurrentCharacteristics(businessUnitId: number, styleId: string) {
  return withConnection(async (conn) => {
    const result = await conn.execute(
      `SELECT sc.characteristic_type_id, sc.characteristic_value_id,
              ct.description as type_desc, cv.description as value_desc
       FROM style_characteristics sc
       LEFT JOIN characteristic_types ct ON sc.business_unit_id = ct.business_unit_id 
         AND sc.characteristic_type_id = ct.characteristic_type_id
       LEFT JOIN characteristic_values cv ON sc.business_unit_id = cv.business_unit_id 
         AND sc.characteristic_type_id = cv.characteristic_type_id
         AND sc.characteristic_value_id = cv.characteristic_value_id
       WHERE sc.business_unit_id = :buId AND sc.style_id = :styleId`,
      { buId: businessUnitId, styleId }
    );
    
    const chars = new Map<string, { valueId: string; valueDesc: string; typeDesc: string }>();
    for (const row of (result.rows || []) as any[]) {
      chars.set(row.CHARACTERISTIC_TYPE_ID, {
        valueId: row.CHARACTERISTIC_VALUE_ID,
        valueDesc: row.VALUE_DESC || '',
        typeDesc: row.TYPE_DESC || row.CHARACTERISTIC_TYPE_ID
      });
    }
    return chars;
  });
}

/**
 * Check if table exists (for graceful degradation)
 */
export async function tableExists(tableName: string): Promise<boolean> {
  return withConnection(async (conn) => {
    const result = await conn.execute(
      `SELECT COUNT(*) AS cnt FROM user_tables WHERE table_name = :tableName`,
      { tableName: tableName.toUpperCase() }
    );
    return ((result.rows as any)?.[0]?.CNT || 0) > 0;
  });
}

/**
 * Get product type for a style
 */
export async function getProductType(businessUnitId: number, styleId: string) {
  return withConnection(async (conn) => {
    const result = await conn.execute(
      `SELECT pt.product_type_id, pt.product_type_name 
       FROM styles s
       LEFT JOIN product_types pt 
         ON s.business_unit_id = pt.business_unit_id
       WHERE s.business_unit_id = :buId AND s.style_id = :styleId
       AND ROWNUM = 1`,
      { buId: businessUnitId, styleId }
    );
    return (result.rows as any)?.[0];
  });
}

/**
 * Get mandatory characteristics for a product type
 */
export async function getMandatoryCharacteristics(
  businessUnitId: number,
  styleId: string,
  productTypeId: number
) {
  return withConnection(async (conn) => {
    const result = await conn.execute(
      `SELECT 
         m.characteristic_type_id,
         ct.description as type_desc,
         CASE WHEN sc.characteristic_value_id IS NOT NULL THEN 1 ELSE 0 END as is_present,
         sc.characteristic_value_id,
         cv.description as value_desc
       FROM PRODUCT_TYPE_MAND_STYLE_CHAR m
       JOIN characteristic_types ct 
         ON m.business_unit_id = ct.business_unit_id 
         AND m.characteristic_type_id = ct.characteristic_type_id
       LEFT JOIN style_characteristics sc 
         ON m.business_unit_id = sc.business_unit_id 
         AND m.characteristic_type_id = sc.characteristic_type_id
         AND sc.style_id = :styleId
       LEFT JOIN characteristic_values cv
         ON sc.business_unit_id = cv.business_unit_id
         AND sc.characteristic_type_id = cv.characteristic_type_id
         AND sc.characteristic_value_id = cv.characteristic_value_id
       WHERE m.business_unit_id = :buId 
         AND m.product_type_id = :productTypeId`,
      { buId: businessUnitId, styleId, productTypeId }
    );

    return ((result.rows || []) as any[]).map(row => ({
      typeId: row.CHARACTERISTIC_TYPE_ID,
      typeDesc: row.TYPE_DESC || '',
      isPresent: row.IS_PRESENT === 1,
      currentValueId: row.CHARACTERISTIC_VALUE_ID,
      currentValueDesc: row.VALUE_DESC
    }));
  });
}

