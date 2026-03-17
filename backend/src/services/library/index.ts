/**
 * Library Service - Unified Export
 * 
 * Re-exports all library domain services (~30 LOC)
 */

export * from './types.service.js';
export * from './values.service.js';
export * from './mappings.service.js';
export * from './templates.service.js';
export * from './thresholds.service.js';
export { DEFAULT_SUB_TYPE, DEFAULT_CONFIDENCE } from './constants.js';

// Backward-compatible class wrapper
import * as types from './types.service.js';
import * as values from './values.service.js';
import * as mappings from './mappings.service.js';
import * as templates from './templates.service.js';
import * as thresholds from './thresholds.service.js';

export class LibraryService {
  getTypes = types.getTypes;
  createType = types.createType;
  updateType = types.updateType;
  deleteType = types.deleteType;
  getValues = values.getValues;
  createValue = values.createValue;
  deleteValue = values.deleteValue;
  getMappings = mappings.getMappings;
  createMapping = mappings.createMapping;
  deleteMapping = mappings.deleteMapping;
  getMappingStats = mappings.getMappingStats;
  exportMappings = mappings.exportMappings;
  importMappings = mappings.importMappings;
  getTemplates = templates.getTemplates;
  createTemplate = templates.createTemplate;
  deleteTemplate = templates.deleteTemplate;
  getThresholds = thresholds.getThresholds;
  setThreshold = thresholds.setThreshold;
  deleteThreshold = thresholds.deleteThreshold;
}

export const libraryService = new LibraryService();

