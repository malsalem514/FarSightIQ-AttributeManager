/**
 * Attributes Database Queries (Boring Vanilla)
 * 
 * Oracle queries for product attributes, mapping rules, and characteristic values.
 * All SQL lives here to keep routes thin and manageable.
 */

import oracledb from 'oracledb';
import { withConnection } from '../oracle-pool.js';
import type { CharValue, MappingRule } from '../../types/index.js';

/**
 * Product attribute from Oracle
 */
export interface ProductAttribute {
  typeId: string;
  typeDescription: string;
  valueId: string;
  description: string;
}

export interface ProductDescriptions {
  shortDescription?: string;
  longDescription?: string;
  webDescription?: string;
  ticketDescription?: string;
}

/**
 * Get current descriptions for a product from Oracle
 */
export async function getProductDescriptions(
  businessUnitId: number,
  styleId: string
): Promise<ProductDescriptions> {
  return withConnection(async (conn) => {
    const result = await conn.execute(
      `SELECT s.description as main_desc, 
              fd.description as foreign_desc, 
              fd.web_description, 
              fd.long_description, 
              fd.ticket_description
       FROM styles s
       LEFT JOIN style_foreign_descriptions fd
         ON s.business_unit_id = fd.business_unit_id
         AND s.style_id = fd.style_id
         AND fd.language_id = 'ENG'
       WHERE s.business_unit_id = :buId
         AND s.style_id = :styleId`,
      { buId: businessUnitId, styleId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const row = result.rows?.[0] as any;
    if (!row) return {};

    return {
      shortDescription: row.FOREIGN_DESC || row.MAIN_DESC,
      longDescription: row.LONG_DESCRIPTION,
      webDescription: row.WEB_DESCRIPTION,
      ticketDescription: row.TICKET_DESCRIPTION
    };
  });
}

/**
 * Get current attributes for a product from Oracle
 */
export async function getProductAttributes(
  businessUnitId: number,
  styleId: string,
  colorId = '000'
): Promise<ProductAttribute[]> {
  return withConnection(async (conn) => {
    const result = await conn.execute(
      `SELECT sc.characteristic_type_id, ct.description as type_descr, sc.characteristic_value_id, cv.description as val_descr
       FROM style_characteristics sc
       LEFT JOIN characteristic_types ct
         ON sc.business_unit_id = ct.business_unit_id
         AND sc.characteristic_type_id = ct.characteristic_type_id
       LEFT JOIN characteristic_values cv 
         ON sc.business_unit_id = cv.business_unit_id
         AND sc.characteristic_type_id = cv.characteristic_type_id
         AND sc.characteristic_value_id = cv.characteristic_value_id
       WHERE sc.business_unit_id = :buId
         AND sc.style_id = :styleId`,
      { buId: businessUnitId, styleId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return (result.rows || []).map((row: any) => ({
      typeId: row.CHARACTERISTIC_TYPE_ID,
      typeDescription: row.TYPE_DESCR || row.CHARACTERISTIC_TYPE_ID,
      valueId: row.CHARACTERISTIC_VALUE_ID,
      description: row.VAL_DESCR || row.CHARACTERISTIC_VALUE_ID
    }));
  });
}

/**
 * Load active mapping rules from Oracle
 */
export async function loadMappingRules(tenantId: string, businessUnitId: number): Promise<MappingRule[]> {
  return withConnection(async (conn) => {
    const result = await conn.execute(
      `SELECT mapping_id, llm_input, target_type_id, target_value_id, 
              confidence_threshold, is_active, created_by, created_at
       FROM llm_char_mappings
       WHERE TENANT_ID = :tenant AND business_unit_id = :buId AND is_active = 'Y'`,
      { tenant: tenantId, buId: businessUnitId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return (result.rows || []).map((row: any) => ({
      mappingId: row.MAPPING_ID,
      businessUnitId,
      llmInput: row.LLM_INPUT,
      targetTypeId: row.TARGET_TYPE_ID,
      targetValueId: row.TARGET_VALUE_ID,
      targetValueDesc: '',
      confidenceThreshold: row.CONFIDENCE_THRESHOLD || 80,
      isActive: row.IS_ACTIVE === 'Y',
      createdBy: row.CREATED_BY || '',
      createdDate: row.CREATED_AT?.toISOString() || ''
    }));
  });
}

/**
 * Load characteristic values from Oracle
 */
export async function loadCharValues(businessUnitId: number): Promise<CharValue[]> {
  return withConnection(async (conn) => {
    const result = await conn.execute(
      `SELECT characteristic_type_id, characteristic_value_id, description
       FROM characteristic_values
       WHERE business_unit_id = :buId`,
      { buId: businessUnitId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return (result.rows || []).map((row: any) => ({
      businessUnitId,
      typeId: row.CHARACTERISTIC_TYPE_ID,
      valueId: row.CHARACTERISTIC_VALUE_ID,
      description: row.DESCRIPTION || ''
    }));
  });
}

/**
 * Get characteristic types for a BU
 */
export async function getCharacteristicTypes(businessUnitId: number) {
  return withConnection(async (conn) => {
    // Deduplicate by CHARACTERISTIC_TYPE_ID since some legacy systems have duplicates
    const result = await conn.execute(
      `SELECT CHARACTERISTIC_TYPE_ID, MIN(DESCRIPTION) as DESCRIPTION 
       FROM CHARACTERISTIC_TYPES 
       WHERE BUSINESS_UNIT_ID = :buId 
       GROUP BY CHARACTERISTIC_TYPE_ID 
       ORDER BY DESCRIPTION`,
      { buId: businessUnitId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows || [];
  });
}

/**
 * Get possible values for a characteristic type
 */
export async function getCharacteristicValues(businessUnitId: number, typeId: string) {
  return withConnection(async (conn) => {
    // Deduplicate by CHARACTERISTIC_VALUE_ID
    const result = await conn.execute(
      `SELECT characteristic_value_id as id, MIN(description) as description
       FROM characteristic_values
       WHERE business_unit_id = :buId AND characteristic_type_id = :typeId
       GROUP BY characteristic_value_id
       ORDER BY description`,
      { buId: businessUnitId, typeId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows || [];
  });
}

/**
 * Get attribute group metadata
 */
export async function getAttributeGroupsMetadata(tenantId: string, businessUnitId: number) {
  return withConnection(async (conn) => {
    const groupResult = await conn.execute(
      `SELECT g.GROUP_ID, g.DISPLAY_NAME, g.SORT_ORDER, tg.CHARACTERISTIC_TYPE_ID
       FROM ATTRIBUTE_GROUPS g
       LEFT JOIN CHARACTERISTIC_TYPE_GROUPS tg ON tg.GROUP_ID = g.GROUP_ID
       WHERE g.TENANT_ID = :tenant AND g.BUSINESS_UNIT_ID = :buId AND g.ACTIVE = 'Y'
       ORDER BY g.SORT_ORDER`,
      { tenant: tenantId, buId: businessUnitId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    const groupMap = new Map();
    const typeToGroup = new Map();
    (groupResult.rows as any[])?.forEach(row => {
      if (!groupMap.has(row.GROUP_ID)) {
        groupMap.set(row.GROUP_ID, { id: row.GROUP_ID, name: row.DISPLAY_NAME, order: row.SORT_ORDER });
      }
      if (row.CHARACTERISTIC_TYPE_ID) {
        typeToGroup.set(row.CHARACTERISTIC_TYPE_ID, row.GROUP_ID);
      }
    });
    return { groupMap, typeToGroup };
  });
}

/**
 * Vendor attribute from product table
 */
export interface VendorAttribute {
  name: string;
  value: string | null;
}

/**
 * Get vendor attributes from STYLES table
 */
export async function getVendorAttributes(
  businessUnitId: number,
  styleId: string
): Promise<VendorAttribute[]> {
  return withConnection(async (conn) => {
    const result = await conn.execute(
      `SELECT vendor_id, vendor_style_no, country_of_origin_id
       FROM styles
       WHERE business_unit_id = :buId
         AND style_id = :styleId`,
      { buId: businessUnitId, styleId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (!result.rows || result.rows.length === 0) return [];

    const row: any = result.rows[0];
    const attributes: VendorAttribute[] = [];

    if (row.VENDOR_ID) attributes.push({ name: 'Vendor ID', value: row.VENDOR_ID });
    if (row.VENDOR_STYLE_NO) attributes.push({ name: 'Vendor Style Number', value: row.VENDOR_STYLE_NO });
    if (row.COUNTRY_OF_ORIGIN_ID) attributes.push({ name: 'Country of Origin', value: row.COUNTRY_OF_ORIGIN_ID });

    return attributes;
  });
}

/**
 * Update AI results status
 */
export async function updateAiResultStatus(
  tenantId: string,
  businessUnitId: number,
  styleId: string,
  colorId: string,
  status: 'accepted' | 'rejected'
): Promise<void> {
  return withConnection(async (conn) => {
    await conn.execute(
      `UPDATE AI_ATTRIBUTION_RESULTS 
       SET STATUS = :status, PROCESSED_AT = CURRENT_TIMESTAMP
       WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :buId AND STYLE_ID = :styleId AND COLOR_ID = :colorId`,
      { tenant: tenantId, buId: businessUnitId, styleId, colorId, status },
      { autoCommit: true }
    );
  });
}

/**
 * Fetch AI results for acceptance
 */
export async function getAiResultForAcceptance(tenantId: string, businessUnitId: number, styleId: string, colorId: string) {
  return withConnection(async (conn) => {
    const result = await conn.execute(
      `SELECT LONG_STYLE_DESC, SHORT_STYLE_DESC, ADDITIONAL_ATTRIBUTES
       FROM AI_ATTRIBUTION_RESULTS
       WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :buId AND STYLE_ID = :styleId AND COLOR_ID = :colorId`,
      { tenant: tenantId, buId: businessUnitId, styleId, colorId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows?.[0] as any;
  });
}

/**
 * Save AI attribution result to database
 */
export async function saveAiResult(
  tenantId: string,
  businessUnitId: number,
  styleId: string,
  colorId: string,
  result: {
    longStyleDesc?: string;
    shortStyleDesc?: string;
    colorAiDesc?: string;
    additionalAttributes?: any;
    llmMetadata?: any;
    status: 'success' | 'error' | 'accepted' | 'rejected';
    errorMessage?: string;
  }
): Promise<void> {
  return withConnection(async (conn) => {
    await conn.execute(
      `MERGE INTO AI_ATTRIBUTION_RESULTS target
       USING (SELECT :tenant as t, :buId as bu, :sid as s, :cid as c FROM DUAL) source
       ON (target.TENANT_ID = source.t AND target.BUSINESS_UNIT_ID = source.bu AND target.STYLE_ID = source.s AND target.COLOR_ID = source.c)
       WHEN MATCHED THEN
         UPDATE SET 
           LONG_STYLE_DESC = CASE WHEN :longDesc IS NOT NULL THEN :longDesc ELSE target.LONG_STYLE_DESC END,
           SHORT_STYLE_DESC = CASE WHEN :shortDesc IS NOT NULL THEN :shortDesc ELSE target.SHORT_STYLE_DESC END,
           COLOR_AI_DESC = CASE WHEN :colorDesc IS NOT NULL THEN :colorDesc ELSE target.COLOR_AI_DESC END,
           ADDITIONAL_ATTRIBUTES = CASE WHEN :attrs IS NOT NULL THEN TO_CLOB(:attrs) ELSE target.ADDITIONAL_ATTRIBUTES END,
           LLM_METADATA = CASE WHEN :meta IS NOT NULL THEN TO_CLOB(:meta) ELSE target.LLM_METADATA END,
           STATUS = :status,
           ERROR_MESSAGE = CASE WHEN :err IS NOT NULL THEN :err ELSE target.ERROR_MESSAGE END,
           PROCESSED_AT = CURRENT_TIMESTAMP
       WHEN NOT MATCHED THEN
         INSERT (TENANT_ID, BUSINESS_UNIT_ID, STYLE_ID, COLOR_ID, LONG_STYLE_DESC, SHORT_STYLE_DESC, COLOR_AI_DESC, ADDITIONAL_ATTRIBUTES, LLM_METADATA, STATUS, ERROR_MESSAGE, PROCESSED_AT)
         VALUES (:tenant, :buId, :sid, :cid, :longDesc, :shortDesc, :colorDesc, TO_CLOB(:attrs), TO_CLOB(:meta), :status, :err, CURRENT_TIMESTAMP)`,
      {
        tenant: tenantId,
        buId: businessUnitId,
        sid: styleId,
        cid: colorId,
        longDesc: result.longStyleDesc || null,
        shortDesc: result.shortStyleDesc || null,
        colorDesc: result.colorAiDesc || null,
        attrs: result.additionalAttributes ? JSON.stringify(result.additionalAttributes) : null,
        meta: result.llmMetadata ? JSON.stringify(result.llmMetadata) : null,
        status: result.status,
        err: result.errorMessage || null
      },
      { autoCommit: true }
    );
  });
}
