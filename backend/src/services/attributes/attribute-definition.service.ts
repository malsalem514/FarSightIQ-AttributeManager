import oracledb from 'oracledb';
import { withConnection } from '../oracle-pool.js';
import { logger } from '../../utils/logger.js';

export interface HierarchyRule {
  ruleId?: number;
  businessUnitId: number;
  levelType: 'DEPT' | 'CLASS' | 'SUBCLASS' | 'STYLE';
  levelId: string;
  characteristicTypeId: string;
  isMandatory: boolean;
  applicability: 'REQUIRED' | 'OPTIONAL' | 'NA';
  defaultValueId?: string;
  characteristicName?: string;
}

export class AttributeDefinitionService {
  /**
   * Parse compound level ID (e.g., "DEPT/CLASS/SUBCLASS" or just "DEPT")
   */
  private parseCompoundLevelId(levelId: string): { deptId?: string; classId?: string; subclassId?: string } {
    const parts = levelId.split('/');
    return {
      deptId: parts[0] || undefined,
      classId: parts[1] || undefined,
      subclassId: parts[2] || undefined
    };
  }

  /**
   * Get hierarchy rules for a specific level
   * Supports both simple IDs (e.g., "MNAP") and compound IDs (e.g., "MNAP/TOPS/POLO")
   */
  async getHierarchyRules(
    tenantId: string,
    businessUnitId: number,
    levelType: 'DEPT' | 'CLASS' | 'SUBCLASS' | 'STYLE',
    levelId: string,
    includeChildren: boolean = false
  ): Promise<HierarchyRule[]> {
    return withConnection(async (conn) => {
      // Check if levelId is compound format (contains '/')
      const isCompound = levelId.includes('/');
      const parsed = isCompound ? this.parseCompoundLevelId(levelId) : null;
      
      let whereClause: string;
      const binds: any = { tenant: tenantId, buId: businessUnitId };

      if (includeChildren && levelType === 'DEPT') {
        // Fetch all rules for the department, plus all rules for classes and subclasses within that department
        const deptId = parsed?.deptId || levelId;
        binds.lId = deptId;
        whereClause = `(
          (r.LEVEL_TYPE = 'DEPT' AND r.LEVEL_ID = :lId)
          OR (r.LEVEL_TYPE = 'CLASS' AND r.LEVEL_ID IN (
            SELECT DISTINCT CLASS_ID FROM ATTR_MGR.HIERARCHY_CACHE 
            WHERE BUSINESS_UNIT_ID = :buId AND DEPT_ID = :lId
          ))
          OR (r.LEVEL_TYPE = 'SUBCLASS' AND (
            r.LEVEL_ID IN (
              SELECT DISTINCT SUB_CLASS_ID FROM ATTR_MGR.HIERARCHY_CACHE 
              WHERE BUSINESS_UNIT_ID = :buId AND DEPT_ID = :lId
            )
            OR r.LEVEL_ID LIKE :lId || '/%'
          ))
        )`;
      } else if (isCompound && levelType === 'SUBCLASS') {
        // For compound SUBCLASS ID, search for the exact compound format
        binds.lId = levelId;
        binds.lType = 'SUBCLASS';
        whereClause = `r.LEVEL_TYPE = :lType AND r.LEVEL_ID = :lId`;
      } else if (isCompound && levelType === 'CLASS') {
        // For compound CLASS ID (DEPT/CLASS), search for matching rules
        binds.lId = levelId;
        binds.lType = 'CLASS';
        // Also try to match just the class part for legacy rules
        const justClassId = parsed?.classId;
        if (justClassId) {
          binds.classId = justClassId;
          whereClause = `r.LEVEL_TYPE = :lType AND (r.LEVEL_ID = :lId OR r.LEVEL_ID = :classId)`;
        } else {
          whereClause = `r.LEVEL_TYPE = :lType AND r.LEVEL_ID = :lId`;
        }
      } else {
        // Simple level ID
        binds.lType = levelType;
        binds.lId = levelId;
        whereClause = `r.LEVEL_TYPE = :lType AND r.LEVEL_ID = :lId`;
      }

      const result = await conn.execute(
        `SELECT r.RULE_ID, r.BUSINESS_UNIT_ID, r.LEVEL_TYPE, r.LEVEL_ID, 
                r.CHARACTERISTIC_TYPE_ID, r.IS_MANDATORY, r.APPLICABILITY, r.DEFAULT_VALUE_ID,
                ct.DESCRIPTION as CHAR_NAME
         FROM ATTR_MGR.ATTRIBUTE_HIERARCHY_RULES r
         LEFT JOIN ATTR_MGR.CHARACTERISTIC_TYPES ct 
           ON ct.BUSINESS_UNIT_ID = r.BUSINESS_UNIT_ID 
           AND ct.CHARACTERISTIC_TYPE_ID = r.CHARACTERISTIC_TYPE_ID
         WHERE r.TENANT_ID = :tenant
           AND r.BUSINESS_UNIT_ID = :buId
           AND ${whereClause}
         ORDER BY r.LEVEL_TYPE, r.LEVEL_ID, r.IS_MANDATORY DESC, ct.DESCRIPTION`,
        binds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      return (result.rows || []).map((row: any) => ({
        ruleId: row.RULE_ID,
        businessUnitId: row.BUSINESS_UNIT_ID,
        levelType: row.LEVEL_TYPE,
        levelId: row.LEVEL_ID,
        characteristicTypeId: row.CHARACTERISTIC_TYPE_ID,
        isMandatory: row.IS_MANDATORY === 'Y',
        applicability: row.APPLICABILITY,
        defaultValueId: row.DEFAULT_VALUE_ID,
        characteristicName: row.CHAR_NAME
      }));
    });
  }

  /**
   * Get effective rules for a style by climbing the hierarchy
   */
  async getEffectiveRules(
    tenantId: string,
    businessUnitId: number,
    deptId: string,
    classId: string,
    subclassId: string,
    styleId?: string
  ): Promise<HierarchyRule[]> {
    // Build compound level IDs (rules are stored with format DEPT/CLASS/SUBCLASS)
    const compoundDeptId = deptId;
    const compoundClassId = classId ? `${deptId}/${classId}` : '';
    const compoundSubclassId = subclassId ? `${deptId}/${classId}/${subclassId}` : '';
    const compoundStyleId = styleId ? `${deptId}/${classId}/${subclassId}/${styleId}` : '';
    
    return withConnection(async (conn) => {
      // Fetch rules from all levels using compound IDs
      // We union them, prioritizing deeper levels (Style > Subclass > Class > Dept)
      const result = await conn.execute(
        `WITH Rules AS (
           SELECT CHARACTERISTIC_TYPE_ID, IS_MANDATORY, APPLICABILITY, DEFAULT_VALUE_ID,
                  CASE LEVEL_TYPE 
                    WHEN 'STYLE' THEN 4
                    WHEN 'SUBCLASS' THEN 3
                    WHEN 'CLASS' THEN 2
                    WHEN 'DEPT' THEN 1
                  END as LEVEL_RANK
           FROM ATTRIBUTE_HIERARCHY_RULES
           WHERE TENANT_ID = :tenant
             AND BUSINESS_UNIT_ID = :buId
             AND (
               (LEVEL_TYPE = 'DEPT' AND LEVEL_ID = :deptId)
               OR (LEVEL_TYPE = 'CLASS' AND LEVEL_ID = :classId)
               OR (LEVEL_TYPE = 'SUBCLASS' AND LEVEL_ID = :subclassId)
               ${styleId ? "OR (LEVEL_TYPE = 'STYLE' AND LEVEL_ID = :compoundStyleId)" : ""}
             )
         ),
         RankedRules AS (
           SELECT CHARACTERISTIC_TYPE_ID, IS_MANDATORY, APPLICABILITY, DEFAULT_VALUE_ID,
                  ROW_NUMBER() OVER (PARTITION BY CHARACTERISTIC_TYPE_ID ORDER BY LEVEL_RANK DESC) as rn
           FROM Rules
         )
         SELECT r.CHARACTERISTIC_TYPE_ID, r.IS_MANDATORY, r.APPLICABILITY, r.DEFAULT_VALUE_ID,
                ct.DESCRIPTION as CHAR_NAME
         FROM RankedRules r
         LEFT JOIN CHARACTERISTIC_TYPES ct 
           ON ct.BUSINESS_UNIT_ID = :buId
           AND ct.CHARACTERISTIC_TYPE_ID = r.CHARACTERISTIC_TYPE_ID
         WHERE r.rn = 1
           AND r.APPLICABILITY != 'NA'
         ORDER BY r.IS_MANDATORY DESC, ct.DESCRIPTION`,
        { 
          tenant: tenantId, 
          buId: businessUnitId, 
          deptId: compoundDeptId, 
          classId: compoundClassId, 
          subclassId: compoundSubclassId, 
          ...(styleId ? { compoundStyleId } : {}) 
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      return (result.rows || []).map((row: any) => ({
        businessUnitId,
        levelType: 'STYLE', // Effective level is calculated
        levelId: styleId || 'effective',
        characteristicTypeId: row.CHARACTERISTIC_TYPE_ID,
        isMandatory: row.IS_MANDATORY === 'Y',
        applicability: row.APPLICABILITY,
        defaultValueId: row.DEFAULT_VALUE_ID,
        characteristicName: row.CHAR_NAME
      }));
    });
  }

  /**
   * Upsert a hierarchy rule
   */
  async upsertHierarchyRule(tenantId: string, rule: HierarchyRule): Promise<void> {
    logger.info('Upserting hierarchy rule', { tenantId, rule });
    return withConnection(async (conn) => {
      try {
        await conn.execute(
          `MERGE INTO ATTRIBUTE_HIERARCHY_RULES target
           USING (SELECT :tenant as t, :buId as bu, :lType as lt, :lId as li, :cType as ct FROM DUAL) source
           ON (target.TENANT_ID = source.t
               AND target.BUSINESS_UNIT_ID = source.bu 
               AND target.LEVEL_TYPE = source.lt 
               AND target.LEVEL_ID = source.li 
               AND target.CHARACTERISTIC_TYPE_ID = source.ct)
           WHEN MATCHED THEN
             UPDATE SET target.IS_MANDATORY = :isMand,
                        target.APPLICABILITY = :appl,
                        target.DEFAULT_VALUE_ID = :defVal,
                        target.UPDATED_AT = CURRENT_TIMESTAMP
           WHEN NOT MATCHED THEN
             INSERT (TENANT_ID, BUSINESS_UNIT_ID, LEVEL_TYPE, LEVEL_ID, CHARACTERISTIC_TYPE_ID, IS_MANDATORY, APPLICABILITY, DEFAULT_VALUE_ID)
             VALUES (:tenant, :buId, :lType, :lId, :cType, :isMand, :appl, :defVal)`,
          {
            tenant: tenantId,
            buId: rule.businessUnitId,
            lType: rule.levelType,
            lId: rule.levelId,
            cType: rule.characteristicTypeId,
            isMand: rule.isMandatory ? 'Y' : 'N',
            appl: rule.applicability,
            defVal: rule.defaultValueId || null
          },
          { autoCommit: true }
        );
        logger.info('Hierarchy rule upserted successfully');
      } catch (err: any) {
        logger.error('Failed to upsert hierarchy rule', { error: err.message, sql: err.sql });
        throw err;
      }
    });
  }

  /**
   * Delete a hierarchy rule by ID
   */
  async deleteHierarchyRule(tenantId: string, ruleId: number): Promise<boolean> {
    logger.info('Deleting hierarchy rule', { tenantId, ruleId });
    return withConnection(async (conn) => {
      const result = await conn.execute(
        `DELETE FROM ATTRIBUTE_HIERARCHY_RULES 
         WHERE RULE_ID = :ruleId AND TENANT_ID = :tenant`,
        { ruleId, tenant: tenantId },
        { autoCommit: true }
      );
      const deleted = (result.rowsAffected || 0) > 0;
      if (deleted) {
        logger.info('Hierarchy rule deleted successfully', { ruleId });
      } else {
        logger.warn('Hierarchy rule not found or already deleted', { ruleId });
      }
      return deleted;
    });
  }

  /**
   * Validate mandatory attributes for a style before sync
   * Returns list of missing mandatory attributes
   * Supports both simple and compound level_id formats
   */
  async validateMandatoryAttributes(
    tenantId: string,
    businessUnitId: number,
    styleId: string
  ): Promise<{ isValid: boolean; missingAttributes: Array<{ typeId: string; name: string; level: string }> }> {
    return withConnection(async (conn) => {
      // 1. Get product hierarchy
      const productResult = await conn.execute(
        `SELECT DEPARTMENT_ID, CLASS_ID, SUB_CLASS_ID 
         FROM ATTR_MGR.CATALOG_CACHE_SHADOW 
         WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :buId AND STYLE_ID = :styleId`,
        { tenant: tenantId, buId: businessUnitId, styleId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      const product = productResult.rows?.[0] as any;
      if (!product) {
        // No product found - allow sync (might be a new product)
        return { isValid: true, missingAttributes: [] };
      }

      // Build compound level IDs for matching
      const deptId = product.DEPARTMENT_ID;
      const classId = product.CLASS_ID;
      const subclassId = product.SUB_CLASS_ID;
      const compoundClassId = `${deptId}/${classId}`;
      const compoundSubclassId = `${deptId}/${classId}/${subclassId}`;

      // 2. Get effective mandatory rules (supports both simple and compound IDs)
      const rulesResult = await conn.execute(
        `WITH EffectiveRules AS (
           SELECT CHARACTERISTIC_TYPE_ID, IS_MANDATORY, LEVEL_TYPE,
                  ROW_NUMBER() OVER (PARTITION BY CHARACTERISTIC_TYPE_ID 
                    ORDER BY CASE LEVEL_TYPE WHEN 'STYLE' THEN 4 WHEN 'SUBCLASS' THEN 3 WHEN 'CLASS' THEN 2 ELSE 1 END DESC) as rn
           FROM ATTR_MGR.ATTRIBUTE_HIERARCHY_RULES
           WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :buId
             AND APPLICABILITY != 'NA'
             AND (
               (LEVEL_TYPE = 'DEPT' AND LEVEL_ID = :deptId)
               OR (LEVEL_TYPE = 'CLASS' AND (LEVEL_ID = :classId OR LEVEL_ID = :compoundClassId))
               OR (LEVEL_TYPE = 'SUBCLASS' AND (LEVEL_ID = :subclassId OR LEVEL_ID = :compoundSubclassId))
               OR (LEVEL_TYPE = 'STYLE' AND LEVEL_ID = :styleId)
             )
         )
         SELECT r.CHARACTERISTIC_TYPE_ID, r.IS_MANDATORY, r.LEVEL_TYPE,
                ct.DESCRIPTION as TYPE_NAME
         FROM EffectiveRules r
         LEFT JOIN CHARACTERISTIC_TYPES ct 
           ON ct.BUSINESS_UNIT_ID = :buId AND ct.CHARACTERISTIC_TYPE_ID = r.CHARACTERISTIC_TYPE_ID
         WHERE r.rn = 1 AND r.IS_MANDATORY = 'Y'`,
        { 
          tenant: tenantId, 
          buId: businessUnitId, 
          styleId,
          deptId,
          classId,
          compoundClassId,
          subclassId,
          compoundSubclassId
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const mandatoryRules = (rulesResult.rows || []) as any[];
      if (mandatoryRules.length === 0) {
        return { isValid: true, missingAttributes: [] };
      }

      // 3. Get current attributes for the style
      const attrsResult = await conn.execute(
        `SELECT CHARACTERISTIC_TYPE_ID FROM STYLE_CHARACTERISTICS 
         WHERE BUSINESS_UNIT_ID = :buId AND STYLE_ID = :styleId`,
        { buId: businessUnitId, styleId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      const existingTypes = new Set((attrsResult.rows || []).map((r: any) => r.CHARACTERISTIC_TYPE_ID));

      // 4. Check AI results for pending attributes
      const aiResult = await conn.execute(
        `SELECT ADDITIONAL_ATTRIBUTES FROM ATTR_MGR.AI_ATTRIBUTION_RESULTS 
         WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :buId AND STYLE_ID = :styleId AND STATUS = 'success'`,
        { tenant: tenantId, buId: businessUnitId, styleId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      const aiRow = aiResult.rows?.[0] as any;
      if (aiRow?.ADDITIONAL_ATTRIBUTES) {
        try {
          const aiAttrs = typeof aiRow.ADDITIONAL_ATTRIBUTES === 'string' 
            ? JSON.parse(aiRow.ADDITIONAL_ATTRIBUTES) 
            : aiRow.ADDITIONAL_ATTRIBUTES;
          if (Array.isArray(aiAttrs)) {
            aiAttrs.forEach((a: any) => {
              if (a.erpTypeId && a.erpValueId) {
                existingTypes.add(a.erpTypeId);
              }
            });
          }
        } catch { /* ignore parse errors */ }
      }

      // 5. Find missing mandatory attributes
      const missing = mandatoryRules
        .filter(r => !existingTypes.has(r.CHARACTERISTIC_TYPE_ID))
        .map(r => ({
          typeId: r.CHARACTERISTIC_TYPE_ID,
          name: r.TYPE_NAME || r.CHARACTERISTIC_TYPE_ID,
          level: r.LEVEL_TYPE
        }));

      return {
        isValid: missing.length === 0,
        missingAttributes: missing
      };
    });
  }

  /**
   * Get impact preview: count of products affected by a rule at a given level
   */
  async getRuleImpactPreview(
    tenantId: string,
    businessUnitId: number,
    levelType: 'DEPT' | 'CLASS' | 'SUBCLASS',
    levelId: string
  ): Promise<{ totalProducts: number; compliantProducts: number; nonCompliantProducts: number }> {
    return withConnection(async (conn) => {
      // Build the WHERE clause based on level type
      let levelFilter = '';
      if (levelType === 'DEPT') {
        levelFilter = 'c.DEPARTMENT_ID = :levelId';
      } else if (levelType === 'CLASS') {
        levelFilter = 'c.CLASS_ID = :levelId';
      } else {
        levelFilter = 'c.SUB_CLASS_ID = :levelId';
      }

      const result = await conn.execute(
        `SELECT COUNT(*) as TOTAL_PRODUCTS
         FROM ATTR_MGR.CATALOG_CACHE_SHADOW c
         WHERE c.TENANT_ID = :tenant
           AND c.BUSINESS_UNIT_ID = :buId
           AND ${levelFilter}`,
        { tenant: tenantId, buId: businessUnitId, levelId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const totalProducts = (result.rows?.[0] as any)?.TOTAL_PRODUCTS || 0;
      
      // For now, return total as non-compliant (conservative estimate)
      // Full compliance check would require joining with AI_ATTRIBUTION_RESULTS
      return {
        totalProducts,
        compliantProducts: 0,
        nonCompliantProducts: totalProducts
      };
    });
  }
}

