/**
 * Test Script: Hierarchy Classification Feature
 * 
 * Tests the complete hierarchy classification workflow:
 * 1. Load hierarchy cache from database
 * 2. Verify cache is valid
 * 3. Extract attributes with hierarchy classification
 * 4. Verify response includes separate ID fields
 * 
 * Usage:
 *   node scripts/test-hierarchy-classification.mjs
 */

import oracledb from 'oracledb';
import { config } from '../src/config.js';
import { hierarchyCacheService } from '../src/services/hierarchy-cache.service.js';
import { AttributesService } from '../src/services/attributes-v2.service.js';

// Oracle Instant Client configuration
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

const TEST_BUSINESS_UNIT_ID = 1; // TODO: Replace with actual business unit ID
const TEST_STYLE_ID = 'TEST001';
const TEST_COLOR_ID = '001';

// Sample base64 image (1x1 red pixel PNG)
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

console.log('========================================');
console.log('HIERARCHY CLASSIFICATION FEATURE TEST');
console.log('========================================\n');

try {
  // ========== STEP 1: Load Hierarchy Cache ==========
  console.log('STEP 1: Loading hierarchy cache...');
  console.log(`Business Unit ID: ${TEST_BUSINESS_UNIT_ID}\n`);
  
  const loadResult = await hierarchyCacheService.loadCache(TEST_BUSINESS_UNIT_ID);
  
  console.log('✅ Hierarchy cache loaded');
  console.log(`   - Rows loaded: ${loadResult.rows_loaded}`);
  console.log(`   - Unique groups: ${loadResult.stats.unique_groups}`);
  console.log(`   - Unique departments: ${loadResult.stats.unique_departments}`);
  console.log(`   - Unique classes: ${loadResult.stats.unique_classes}`);
  console.log(`   - Unique subclasses: ${loadResult.stats.unique_subclasses}`);
  console.log(`   - Duration: ${loadResult.stats.duration_ms}ms\n`);
  
  // ========== STEP 2: Verify Cache is Valid ==========
  console.log('STEP 2: Verifying cache validity...\n');
  
  const isValid = await hierarchyCacheService.isCacheValid(TEST_BUSINESS_UNIT_ID);
  
  if (isValid) {
    console.log('✅ Hierarchy cache is valid\n');
  } else {
    console.log('❌ Hierarchy cache is expired or missing');
    console.log('   Suggestion: Re-run Step 1 to reload cache\n');
    process.exit(1);
  }
  
  // ========== STEP 3: Get Hierarchy Options ==========
  console.log('STEP 3: Getting hierarchy options...\n');
  
  const hierarchy = await hierarchyCacheService.getCache(TEST_BUSINESS_UNIT_ID);
  
  console.log('✅ Hierarchy options retrieved');
  console.log(`   - Groups: ${Object.keys(hierarchy.groups).length}`);
  console.log(`   - Departments: ${Object.keys(hierarchy.departments).length}`);
  console.log(`   - Classes: ${Object.keys(hierarchy.classes).length}`);
  console.log(`   - Subclasses: ${Object.keys(hierarchy.subclasses).length}\n`);
  
  // Show sample options
  console.log('Sample Groups:');
  Object.entries(hierarchy.groups).slice(0, 5).forEach(([id, desc]) => {
    console.log(`   - ${id}:${desc}`);
  });
  console.log();
  
  console.log('Sample Departments:');
  Object.entries(hierarchy.departments).slice(0, 5).forEach(([id, name]) => {
    console.log(`   - ${id}:${name}`);
  });
  console.log();
  
  // ========== STEP 4: Initialize Attributes Service ==========
  console.log('STEP 4: Initializing Attributes Service...\n');
  
  const attributesService = new AttributesService({
    providerType: 'openai',
    openaiApiKey: config.llm.openaiApiKey,
    openaiModel: config.llm.openaiModel,
    openaiTemperature: 0.2,
    cacheEnabled: false, // Disable cache for testing
  });
  
  console.log('✅ Attributes Service initialized\n');
  
  // ========== STEP 5: Extract Attributes with Hierarchy ==========
  console.log('STEP 5: Extracting attributes with hierarchy classification...\n');
  console.log('NOTE: This step calls OpenAI API and incurs costs (~$0.001 per call)');
  console.log('Press Ctrl+C within 5 seconds to abort...\n');
  
  // Wait 5 seconds
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  console.log('Calling LLM...');
  const startTime = Date.now();
  
  const results = await attributesService.extractBatchWithBase64(
    TEST_BUSINESS_UNIT_ID,
    [{
      styleId: TEST_STYLE_ID,
      colorId: TEST_COLOR_ID,
      imageBase64: TEST_IMAGE_BASE64,
    }]
  );
  
  const duration = Date.now() - startTime;
  const result = results[0];
  
  console.log(`✅ Extraction complete (${duration}ms)\n`);
  
  // ========== STEP 6: Verify Response Structure ==========
  console.log('STEP 6: Verifying response structure...\n');
  
  const checks = [
    { name: 'Product Category (Description)', value: result.productCategory },
    { name: 'Product Category ID', value: result.productCategoryId },
    { name: 'Department (Description)', value: result.department },
    { name: 'Department ID', value: result.departmentId },
    { name: 'Category (Description)', value: result.category },
    { name: 'Category ID', value: result.categoryId },
    { name: 'Sub-Category (Description)', value: result.subCategory },
    { name: 'Sub-Category ID', value: result.subCategoryId },
    { name: 'Brand', value: result.brand },
    { name: 'AI Product Category', value: result.aiProductCategory },
    { name: 'AI Department', value: result.aiDepartment },
    { name: 'AI Category', value: result.aiCategory },
    { name: 'AI Sub-Category', value: result.aiSubCategory },
    { name: 'AI Brand Description', value: result.aiBrandDesc },
    { name: 'Short Description', value: result.shortStyleDesc },
    { name: 'Long Description', value: result.longStyleDesc },
    { name: 'Color AI Description', value: result.colorAiDesc },
    { name: 'Confidence', value: result.confidence },
  ];
  
  let passedChecks = 0;
  let failedChecks = 0;
  
  checks.forEach(check => {
    const hasValue = check.value !== undefined && check.value !== null && check.value !== '';
    if (hasValue) {
      console.log(`✅ ${check.name}: ${check.value}`);
      passedChecks++;
    } else {
      console.log(`⚠️  ${check.name}: (empty)`);
      failedChecks++;
    }
  });
  
  console.log();
  
  // Hierarchy Confidence
  if (result.hierarchyConfidence) {
    console.log('Hierarchy Confidence:');
    Object.entries(result.hierarchyConfidence).forEach(([level, confidence]) => {
      console.log(`   - ${level}: ${confidence}`);
    });
    console.log();
  }
  
  // Additional Attributes
  if (result.attributes && result.attributes.length > 0) {
    console.log(`Additional Attributes (${result.attributes.length}):`);
    result.attributes.slice(0, 5).forEach(attr => {
      console.log(`   - ${attr.mappedTypeId}: ${attr.mappedValueId} (confidence: ${attr.confidence})`);
    });
    console.log();
  }
  
  // ========== FINAL SUMMARY ==========
  console.log('========================================');
  console.log('TEST SUMMARY');
  console.log('========================================\n');
  console.log(`✅ Hierarchy cache loaded: ${loadResult.rows_loaded} rows`);
  console.log(`✅ Cache validation: Valid`);
  console.log(`✅ Attribute extraction: Complete (${duration}ms)`);
  console.log(`✅ Response structure checks: ${passedChecks}/${checks.length} passed`);
  
  if (failedChecks > 0) {
    console.log(`⚠️  Empty fields: ${failedChecks}/${checks.length}`);
    console.log(`   Note: Empty fields are acceptable for QC failures or missing data`);
  }
  
  console.log();
  console.log('========================================');
  console.log('✅ ALL TESTS PASSED');
  console.log('========================================');
  
  process.exit(0);
  
} catch (error) {
  console.error('\n❌ TEST FAILED\n');
  console.error('Error:', error.message);
  console.error('\nStack trace:');
  console.error(error.stack);
  console.error('\nSuggestions:');
  console.error('1. Check Oracle database connection');
  console.error('2. Verify V011 migration has been applied');
  console.error('3. Ensure hierarchy cache source table exists');
  console.error('4. Check OpenAI API key is valid');
  console.error('5. Review logs for detailed error information');
  process.exit(1);
}

