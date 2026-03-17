/**
 * Templates Service
 * 
 * CRUD for category attribute templates (~80 LOC)
 */

import oracledb from 'oracledb';
import type { CharTemplate, CreateTemplateInput } from '../../types/index.js';
import { withConnection } from '../oracle-pool.js';
import { DEFAULT_CREATED_BY, QUERY_OPTIONS } from './constants.js';

/** Transform Oracle row to CharTemplate */
function transformTemplate(businessUnitId: number, row: any): CharTemplate {
  return {
    templateId: row.TEMPLATE_ID,
    businessUnitId,
    templateName: row.TEMPLATE_NAME,
    targetCategory: row.TARGET_CATEGORY || '',
    isActive: row.IS_ACTIVE === 'Y',
    enforceOnSync: row.ENFORCE_ON_SYNC === 'Y',
    typeIds: [],
    typeCount: row.TYPE_COUNT || 0,
    createdBy: row.CREATED_BY || '',
    createdDate: row.CREATED_AT?.toISOString() || ''
  };
}

/** Get all templates for a business unit */
export async function getTemplates(businessUnitId: number): Promise<CharTemplate[]> {
  return withConnection(async (conn) => {
    try {
      const result = await conn.execute(
        `SELECT t.template_id, t.template_name, t.target_category, t.is_active, 
                t.enforce_on_sync, t.created_by, t.created_at,
                COUNT(tt.characteristic_type_id) as type_count
         FROM char_templates t
         LEFT JOIN char_template_types tt ON t.template_id = tt.template_id
         WHERE t.business_unit_id = :buId
         GROUP BY t.template_id, t.template_name, t.target_category, t.is_active,
                  t.enforce_on_sync, t.created_by, t.created_at
         ORDER BY t.template_name`,
        { buId: businessUnitId },
        QUERY_OPTIONS
      );
      return (result.rows || []).map((row) => transformTemplate(businessUnitId, row));
    } catch (error: any) {
      // Return empty if table doesn't exist (not yet migrated)
      if (error.errorNum === 942) return [];
      throw error;
    }
  });
}

/** Create a new template with associated types */
export async function createTemplate(input: CreateTemplateInput): Promise<CharTemplate> {
  return withConnection(async (conn) => {
    const templateResult = await conn.execute(
      `INSERT INTO char_templates (business_unit_id, template_name, target_category, is_active, enforce_on_sync, created_by, created_at)
       VALUES (:buId, :name, :category, 'Y', :enforce, :createdBy, SYSTIMESTAMP)
       RETURNING template_id INTO :templateId`,
      {
        buId: input.businessUnitId, name: input.templateName, category: input.targetCategory,
        enforce: input.enforceOnSync ? 'Y' : 'N', createdBy: DEFAULT_CREATED_BY,
        templateId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      }
    );

    const templateId = (templateResult.outBinds as any)?.templateId?.[0] || 1;

    for (const typeId of input.typeIds) {
      await conn.execute(
        `INSERT INTO char_template_types (template_id, business_unit_id, characteristic_type_id) VALUES (:templateId, :buId, :typeId)`,
        { templateId, buId: input.businessUnitId, typeId }
      );
    }

    await (conn as any).commit?.();

    return {
      templateId, businessUnitId: input.businessUnitId, templateName: input.templateName, targetCategory: input.targetCategory,
      isActive: true, enforceOnSync: input.enforceOnSync || false, typeIds: input.typeIds, typeCount: input.typeIds.length,
      createdBy: DEFAULT_CREATED_BY, createdDate: new Date().toISOString()
    };
  });
}

/** Delete a template and its associated types */
export async function deleteTemplate(templateId: number): Promise<void> {
  await withConnection(async (conn) => {
    await conn.execute(`DELETE FROM char_template_types WHERE template_id = :templateId`, { templateId });
    await conn.execute(`DELETE FROM char_templates WHERE template_id = :templateId`, { templateId }, { autoCommit: true });
  });
}

