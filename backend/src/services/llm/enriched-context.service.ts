/**
 * Enriched Context Service v2 (Enhanced Prompt Engineering)
 * 
 * Gathers comprehensive product data for high-quality LLM prompts:
 * - Full product details from STYLES table
 * - Existing attributes from STYLE_CHARACTERISTICS
 * - Hierarchy with full names
 * - Mandatory and optional rules from hierarchy governance
 * - Valid values for constrained attributes
 * - Pricing, sizing, and dimension data
 * 
 * @version 2.0.0
 */

import { withConnection } from '../oracle-pool.js';
import { SettingsService } from '../settings.service.js';
import { AttributeDefinitionService } from '../attributes/attribute-definition.service.js';
import * as attributesDb from '../attributes/attributes-db.js';
import { logger } from '../../utils/logger.js';
import oracledb from 'oracledb';
import type { FullProductContext } from '../../prompts/attribute-extraction-v2.js';

export interface EnrichedContext {
  // Existing ERP Attributes
  erpAttributes: Array<{
    typeId: string;
    typeName: string;
    valueId: string;
    valueName: string;
  }>;
  
  // Mandatory Rules from Hierarchy
  mandatoryRules: Array<{
    attributeId: string;
    attributeName: string;
    isMandatory: boolean;
    levelType: string;
    levelId: string;
  }>;
  
  // Product Hierarchy
  hierarchy: {
    deptId?: string;
    deptName?: string;
    classId?: string;
    className?: string;
    subclassId?: string;
    subclassName?: string;
  };
  
  // Product Metadata
  product: {
    styleId: string;
    colorId: string;
    brand?: string;
    description?: string;
    vendor?: string;
    season?: string;
  };
}

export class EnrichedContextService {
  private attributeDefinitionService = new AttributeDefinitionService();

  /**
   * Build FULL product context for v2 prompts
   * Gathers ALL available data for maximum prompt quality
   */
  async buildFullContext(
    businessUnitId: number,
    styleId: string,
    colorId: string = '000'
  ): Promise<FullProductContext> {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();

    // OPTIMIZATION: Fetch hierarchy ONCE, then pass to dependent methods
    // Previously getHierarchy was called 3 times (here + mandatoryRules + optionalRules)
    const [
      productDetails,
      existingAttributes,
      hierarchy
    ] = await Promise.all([
      this.getFullProductDetails(businessUnitId, styleId),
      this.getExistingAttributes(businessUnitId, styleId),
      this.getHierarchy(businessUnitId, styleId)
    ]);

    // OPTIMIZATION: Now fetch rules using the hierarchy we already have
    // This avoids 2 redundant DB calls to CATALOG_CACHE_SHADOW
    const [mandatoryRules, optionalRules] = await Promise.all([
      this.getMandatoryRulesWithHierarchy(tenantId, businessUnitId, hierarchy),
      this.getOptionalRulesWithHierarchy(tenantId, businessUnitId, hierarchy)
    ]);

    // Get valid values for all attributes (optional - can skip for speed)
    // Only fetch if we have attributes to look up
    const allAttrIds = [...mandatoryRules.map(r => r.attributeId), ...optionalRules.map(r => r.attributeId)];
    const validValues = allAttrIds.length > 0 
      ? await this.getValidValuesForAttributes(businessUnitId, allAttrIds)
      : {};

    return {
      styleId,
      colorId,
      product: productDetails,
      hierarchy,
      existingAttributes,
      mandatoryRules,
      optionalRules,
      validValues
    };
  }

  /**
   * Get FULL product details from STYLES table
   */
  private async getFullProductDetails(businessUnitId: number, styleId: string): Promise<FullProductContext['product']> {
    try {
      return await withConnection(async (conn) => {
        const result = await conn.execute(
          `SELECT 
             s.STYLE_ID, s.DESCRIPTION, s.VENDOR_STYLE_NO,
             s.BRAND_ID, b.DESCRIPTION as BRAND_NAME,
             s.VENDOR_ID, v.NAME as VENDOR_NAME,
             s.SEASON_ID, s.SIZE_RANGE_ID,
             s.COUNTRY_OF_ORIGIN_ID,
             s.MSRP, s.TICKET_PRICE, s.COMPARATIVE_PRICE,
             s.NOTE_1, s.NOTE_2, s.NOTE_3,
             s.WEIGHT, s.HEIGHT, s.WIDTH, s.DEPTH,
             s.NON_SIZED_IND, s.NO_COLOR_IND
           FROM STYLES s
           LEFT JOIN BRANDS b ON s.BUSINESS_UNIT_ID = b.BUSINESS_UNIT_ID AND s.BRAND_ID = b.BRAND_ID
           LEFT JOIN VENDORS v ON s.BUSINESS_UNIT_ID = v.BUSINESS_UNIT_ID AND s.VENDOR_ID = v.VENDOR_ID
           WHERE s.BUSINESS_UNIT_ID = :bu AND s.STYLE_ID = :sid`,
          { bu: businessUnitId, sid: styleId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        const row = result.rows?.[0] as any;
        if (!row) return {};
        
        const notes = [row.NOTE_1, row.NOTE_2, row.NOTE_3].filter(n => n);
        
        return {
          description: row.DESCRIPTION,
          vendorStyleNo: row.VENDOR_STYLE_NO,
          brandId: row.BRAND_ID,
          brandName: row.BRAND_NAME,
          vendorId: row.VENDOR_ID,
          vendorName: row.VENDOR_NAME,
          seasonId: row.SEASON_ID,
          sizeRangeId: row.SIZE_RANGE_ID,
          countryOfOrigin: row.COUNTRY_OF_ORIGIN_ID,
          msrp: row.MSRP ? parseFloat(row.MSRP) : undefined,
          ticketPrice: row.TICKET_PRICE ? parseFloat(row.TICKET_PRICE) : undefined,
          comparativePrice: row.COMPARATIVE_PRICE ? parseFloat(row.COMPARATIVE_PRICE) : undefined,
          notes: notes.length > 0 ? notes : undefined,
          weight: row.WEIGHT ? parseFloat(row.WEIGHT) : undefined,
          dimensions: (row.HEIGHT || row.WIDTH || row.DEPTH) ? {
            height: row.HEIGHT ? parseFloat(row.HEIGHT) : undefined,
            width: row.WIDTH ? parseFloat(row.WIDTH) : undefined,
            depth: row.DEPTH ? parseFloat(row.DEPTH) : undefined
          } : undefined,
          nonSizedInd: row.NON_SIZED_IND === 'Y',
          noColorInd: row.NO_COLOR_IND === 'Y'
        };
      });
    } catch (e: any) {
      logger.warn('Failed to get product details', { styleId, error: e.message });
      return {};
    }
  }

  /**
   * Get existing attributes with FULL type and value names
   */
  private async getExistingAttributes(
    businessUnitId: number,
    styleId: string
  ): Promise<FullProductContext['existingAttributes']> {
    try {
      return await withConnection(async (conn) => {
        const result = await conn.execute(
          `SELECT 
             sc.CHARACTERISTIC_TYPE_ID as TYPE_ID,
             sc.CHARACTERISTIC_VALUE_ID as VALUE_ID,
             ct.DESCRIPTION as TYPE_NAME,
             cv.DESCRIPTION as VALUE_NAME
           FROM STYLE_CHARACTERISTICS sc
           LEFT JOIN ATTR_MGR.CHARACTERISTIC_TYPES ct 
             ON ct.BUSINESS_UNIT_ID = sc.BUSINESS_UNIT_ID 
             AND ct.CHARACTERISTIC_TYPE_ID = sc.CHARACTERISTIC_TYPE_ID
           LEFT JOIN ATTR_MGR.CHARACTERISTIC_VALUES cv 
             ON cv.BUSINESS_UNIT_ID = sc.BUSINESS_UNIT_ID 
             AND cv.CHARACTERISTIC_TYPE_ID = sc.CHARACTERISTIC_TYPE_ID 
             AND cv.CHARACTERISTIC_VALUE_ID = sc.CHARACTERISTIC_VALUE_ID
           WHERE sc.BUSINESS_UNIT_ID = :bu AND sc.STYLE_ID = :sid`,
          { bu: businessUnitId, sid: styleId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        return (result.rows || []).map((row: any) => ({
          typeId: row.TYPE_ID,
          typeName: row.TYPE_NAME || row.TYPE_ID,
          valueId: row.VALUE_ID,
          valueName: row.VALUE_NAME || row.VALUE_ID
        }));
      });
    } catch (e: any) {
      logger.warn('Failed to get existing attributes', { styleId, error: e.message });
      return [];
    }
  }

  /**
   * Get mandatory rules with hierarchy already fetched (OPTIMIZED)
   */
  private async getMandatoryRulesWithHierarchy(
    tenantId: string,
    businessUnitId: number,
    hierarchy: FullProductContext['hierarchy']
  ): Promise<FullProductContext['mandatoryRules']> {
    try {
      if (!hierarchy.deptId) return [];

      const effectiveRules = await this.attributeDefinitionService.getEffectiveRules(
        tenantId,
        businessUnitId,
        hierarchy.deptId,
        hierarchy.classId || '',
        hierarchy.subclassId || ''
      );

      // Get attribute names
      const typeIds = [...new Set(effectiveRules.map(r => r.characteristicTypeId))];
      const typeNames = await this.getAttributeTypeNames(businessUnitId, typeIds);

      return effectiveRules
        .filter(r => r.isMandatory)
        .map(r => ({
          attributeId: r.characteristicTypeId,
          attributeName: typeNames[r.characteristicTypeId] || r.characteristicTypeId,
          levelType: r.levelType,
          levelId: r.levelId
        }));
    } catch (e: any) {
      logger.warn('Failed to get mandatory rules', { error: e.message });
      return [];
    }
  }

  /**
   * Get optional rules with hierarchy already fetched (OPTIMIZED)
   */
  private async getOptionalRulesWithHierarchy(
    tenantId: string,
    businessUnitId: number,
    hierarchy: FullProductContext['hierarchy']
  ): Promise<FullProductContext['optionalRules']> {
    try {
      if (!hierarchy.deptId) return [];

      const effectiveRules = await this.attributeDefinitionService.getEffectiveRules(
        tenantId,
        businessUnitId,
        hierarchy.deptId,
        hierarchy.classId || '',
        hierarchy.subclassId || ''
      );

      const typeIds = [...new Set(effectiveRules.map(r => r.characteristicTypeId))];
      const typeNames = await this.getAttributeTypeNames(businessUnitId, typeIds);

      return effectiveRules
        .filter(r => !r.isMandatory)
        .slice(0, 30) // Include more attributes - user decides what to keep
        .map(r => ({
          attributeId: r.characteristicTypeId,
          attributeName: typeNames[r.characteristicTypeId] || r.characteristicTypeId
        }));
    } catch (e: any) {
      logger.warn('Failed to get optional rules', { error: e.message });
      return [];
    }
  }

  /**
   * LEGACY: Get mandatory rules with attribute names (calls getHierarchy internally)
   * @deprecated Use getMandatoryRulesWithHierarchy for better performance
   */
  private async getMandatoryRulesWithDetails(
    tenantId: string,
    businessUnitId: number,
    styleId: string
  ): Promise<FullProductContext['mandatoryRules']> {
    const hierarchy = await this.getHierarchy(businessUnitId, styleId);
    return this.getMandatoryRulesWithHierarchy(tenantId, businessUnitId, hierarchy);
  }

  /**
   * LEGACY: Get optional (non-mandatory) rules (calls getHierarchy internally)
   * @deprecated Use getOptionalRulesWithHierarchy for better performance
   */
  private async getOptionalRules(
    tenantId: string,
    businessUnitId: number,
    styleId: string
  ): Promise<FullProductContext['optionalRules']> {
    const hierarchy = await this.getHierarchy(businessUnitId, styleId);
    return this.getOptionalRulesWithHierarchy(tenantId, businessUnitId, hierarchy);
  }

  /**
   * Get attribute type names from CHARACTERISTIC_TYPES
   */
  private async getAttributeTypeNames(
    businessUnitId: number,
    typeIds: string[]
  ): Promise<Record<string, string>> {
    if (typeIds.length === 0) return {};
    
    try {
      return await withConnection(async (conn) => {
        const placeholders = typeIds.map((_, i) => `:t${i}`).join(',');
        const binds: any = { bu: businessUnitId };
        typeIds.forEach((id, i) => binds[`t${i}`] = id);
        
        const result = await conn.execute(
          `SELECT CHARACTERISTIC_TYPE_ID, DESCRIPTION 
           FROM ATTR_MGR.CHARACTERISTIC_TYPES
           WHERE BUSINESS_UNIT_ID = :bu 
             AND CHARACTERISTIC_TYPE_ID IN (${placeholders})`,
          binds,
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        const names: Record<string, string> = {};
        (result.rows || []).forEach((row: any) => {
          names[row.CHARACTERISTIC_TYPE_ID] = row.DESCRIPTION || row.CHARACTERISTIC_TYPE_ID;
        });
        return names;
      });
    } catch (e: any) {
      logger.warn('Failed to get attribute type names', { error: e.message });
      return {};
    }
  }

  /**
   * Get valid values for specific attributes
   */
  private async getValidValuesForAttributes(
    businessUnitId: number,
    attributeIds: string[]
  ): Promise<Record<string, Array<{ id: string; name: string }>>> {
    if (attributeIds.length === 0) return {};
    
    try {
      return await withConnection(async (conn) => {
        const validValues: Record<string, Array<{ id: string; name: string }>> = {};
        
        // Limit to top priority attributes to avoid huge queries
        const priorityAttrs = attributeIds.slice(0, 10);
        
        for (const attrId of priorityAttrs) {
          const result = await conn.execute(
            `SELECT CHARACTERISTIC_VALUE_ID, DESCRIPTION
             FROM ATTR_MGR.CHARACTERISTIC_VALUES
             WHERE BUSINESS_UNIT_ID = :bu AND CHARACTERISTIC_TYPE_ID = :tid
             ORDER BY DESCRIPTION
             FETCH FIRST 30 ROWS ONLY`,
            { bu: businessUnitId, tid: attrId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          
          if (result.rows && result.rows.length > 0) {
            validValues[attrId] = (result.rows as any[]).map(r => ({
              id: r.CHARACTERISTIC_VALUE_ID,
              name: r.DESCRIPTION || r.CHARACTERISTIC_VALUE_ID
            }));
          }
        }
        
        return validValues;
      });
    } catch (e: any) {
      logger.warn('Failed to get valid values', { error: e.message });
      return {};
    }
  }

  // ============================================================================
  // LEGACY METHODS (for backward compatibility)
  // ============================================================================

  /**
   * Build basic enriched context (legacy method)
   */
  async buildContext(
    businessUnitId: number,
    styleId: string,
    colorId: string = '000'
  ): Promise<EnrichedContext> {
    const settings = await SettingsService.getInstance();
    const tenantId = await settings.getActiveTenantId();

    const [erpAttributes, productInfo, hierarchy] = await Promise.all([
      this.getErpAttributes(businessUnitId, styleId),
      this.getProductInfo(businessUnitId, styleId),
      this.getHierarchy(businessUnitId, styleId)
    ]);

    let mandatoryRules: EnrichedContext['mandatoryRules'] = [];
    if (hierarchy.deptId) {
      mandatoryRules = await this.getMandatoryRules(
        tenantId, businessUnitId, hierarchy.deptId, hierarchy.classId, hierarchy.subclassId
      );
    }

    return {
      erpAttributes,
      mandatoryRules,
      hierarchy,
      product: {
        styleId,
        colorId,
        brand: productInfo?.brand,
        description: productInfo?.description,
        vendor: productInfo?.vendor,
        season: productInfo?.season
      }
    };
  }

  private async getErpAttributes(
    businessUnitId: number, 
    styleId: string
  ): Promise<EnrichedContext['erpAttributes']> {
    try {
      const attrs = await attributesDb.getProductAttributes(businessUnitId, styleId);
      return attrs.map(a => ({
        typeId: a.typeId,
        typeName: a.typeDescription,
        valueId: a.valueId,
        valueName: a.description
      }));
    } catch (e: any) {
      logger.warn('Failed to get ERP attributes for context', { styleId, error: e.message });
      return [];
    }
  }

  private async getProductInfo(businessUnitId: number, styleId: string) {
    try {
      return await withConnection(async (conn) => {
        const result = await conn.execute(
          `SELECT s.STYLE_ID, s.DESCRIPTION, s.VENDOR_ID, s.SEASON_ID,
                  b.DESCRIPTION as BRAND_NAME
           FROM STYLES s
           LEFT JOIN BRANDS b ON s.BUSINESS_UNIT_ID = b.BUSINESS_UNIT_ID 
                              AND s.BRAND_ID = b.BRAND_ID
           WHERE s.BUSINESS_UNIT_ID = :bu AND s.STYLE_ID = :sid`,
          { bu: businessUnitId, sid: styleId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        const row = result.rows?.[0] as any;
        if (!row) return null;
        
        return {
          description: row.DESCRIPTION,
          brand: row.BRAND_NAME,
          vendor: row.VENDOR_ID,
          season: row.SEASON_ID
        };
      });
    } catch (e: any) {
      logger.warn('Failed to get product info for context', { styleId, error: e.message });
      return null;
    }
  }

  private async getHierarchy(
    businessUnitId: number, 
    styleId: string
  ): Promise<EnrichedContext['hierarchy']> {
    try {
      return await withConnection(async (conn) => {
        const settings = await SettingsService.getInstance();
        const tenantId = await settings.getActiveTenantId();
        
        const result = await conn.execute(
          `SELECT DEPARTMENT_ID as DEPT_ID, DEPT_NAME, CLASS_ID, CLASS_NAME, SUB_CLASS_ID, SUBCLASS_NAME
           FROM ATTR_MGR.CATALOG_CACHE_SHADOW
           WHERE TENANT_ID = :tenant
             AND BUSINESS_UNIT_ID = :bu 
             AND STYLE_ID = :sid`,
          { tenant: tenantId, bu: businessUnitId, sid: styleId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        const row = result.rows?.[0] as any;
        if (!row) return {};
        
        return {
          deptId: row.DEPT_ID,
          deptName: row.DEPT_NAME,
          classId: row.CLASS_ID,
          className: row.CLASS_NAME,
          subclassId: row.SUB_CLASS_ID,
          subclassName: row.SUBCLASS_NAME
        };
      });
    } catch (e: any) {
      logger.warn('Failed to get hierarchy for context', { styleId, error: e.message });
      return {};
    }
  }

  private async getMandatoryRules(
    tenantId: string,
    businessUnitId: number,
    deptId: string,
    classId?: string,
    subclassId?: string
  ): Promise<EnrichedContext['mandatoryRules']> {
    try {
      const effectiveRules = await this.attributeDefinitionService.getEffectiveRules(
        tenantId, businessUnitId, deptId, classId || '', subclassId || ''
      );
      
      return effectiveRules.map(r => ({
        attributeId: r.characteristicTypeId,
        attributeName: r.characteristicTypeId,
        isMandatory: r.isMandatory,
        levelType: r.levelType,
        levelId: r.levelId
      }));
    } catch (e: any) {
      logger.warn('Failed to get mandatory rules for context', { deptId, error: e.message });
      return [];
    }
  }

  /**
   * Format context for inclusion in LLM prompt (legacy)
   */
  formatForPrompt(context: EnrichedContext): string {
    const sections: string[] = [];
    
    if (context.product.brand || context.product.description) {
      sections.push(`===== PRODUCT INFORMATION =====
Style ID: ${context.product.styleId}
${context.product.brand ? `Brand: ${context.product.brand}` : ''}
${context.product.description ? `Current Description: ${context.product.description}` : ''}
${context.product.vendor ? `Vendor: ${context.product.vendor}` : ''}
${context.product.season ? `Season: ${context.product.season}` : ''}`);
    }
    
    if (context.hierarchy.deptId) {
      sections.push(`===== PRODUCT HIERARCHY =====
Department: ${context.hierarchy.deptId}${context.hierarchy.deptName ? ` - ${context.hierarchy.deptName}` : ''}
${context.hierarchy.classId ? `Class: ${context.hierarchy.classId}${context.hierarchy.className ? ` - ${context.hierarchy.className}` : ''}` : ''}
${context.hierarchy.subclassId ? `Subclass: ${context.hierarchy.subclassId}${context.hierarchy.subclassName ? ` - ${context.hierarchy.subclassName}` : ''}` : ''}`);
    }
    
    if (context.erpAttributes.length > 0) {
      const attrList = context.erpAttributes
        .slice(0, 10)
        .map(a => `- ${a.typeId}: ${a.valueName}`)
        .join('\n');
      sections.push(`===== EXISTING ERP ATTRIBUTES (Reference) =====
${attrList}
${context.erpAttributes.length > 10 ? `... and ${context.erpAttributes.length - 10} more` : ''}`);
    }
    
    const mandatoryAttrs = context.mandatoryRules.filter(r => r.isMandatory);
    if (mandatoryAttrs.length > 0) {
      sections.push(`===== MANDATORY ATTRIBUTES (Must Extract) =====
${mandatoryAttrs.map(r => `- ${r.attributeId}`).join('\n')}`);
    }
    
    return sections.join('\n\n');
  }
}

export const enrichedContextService = new EnrichedContextService();
