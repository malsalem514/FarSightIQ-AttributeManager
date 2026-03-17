/**
 * Library Types
 * 
 * Shared types for Library tab components (~35 LOC)
 */

export interface MappingRule {
  id: string;
  llmInput: string;
  targetTypeId: string;
  targetValueId: string;
  targetValueDesc: string;
}

export interface ApiCharType {
  typeId: string;
  description: string;
  subType: string;
  valueCount: number;
}

export interface ApiCharValue {
  typeId: string;
  valueId: string;
  description: string;
}

export interface ApiMapping {
  mappingId: number;
  llmInput: string;
  targetTypeId: string;
  targetValueId: string;
  targetValueDesc: string;
}

export interface ApiTemplate {
  templateId: number;
  templateName: string;
  targetCategory: string;
  typeCount: number;
}

