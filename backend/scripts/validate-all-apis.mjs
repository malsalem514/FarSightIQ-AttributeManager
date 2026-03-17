/**
 * Comprehensive API Validation Script
 * Tests all backend APIs and compares responses to UI expectations
 */

const BASE_URL = 'http://localhost:3002/api';
const BUSINESS_UNIT_ID = 1;

// Color codes for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

const results = {
  passed: [],
  failed: [],
  warnings: []
};

async function testAPI(name, url, options = {}, validator) {
  console.log(`\n${colors.cyan}Testing: ${name}${colors.reset}`);
  console.log(`  URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    
    const data = await response.json();
    
    // Check HTTP status
    if (!response.ok) {
      results.failed.push({ name, error: `HTTP ${response.status}`, data });
      console.log(`  ${colors.red}✗ FAILED${colors.reset}: HTTP ${response.status}`);
      console.log(`  Error:`, data.error || data);
      return false;
    }
    
    // Check response structure
    if (!data.success) {
      results.failed.push({ name, error: 'success: false', data });
      console.log(`  ${colors.red}✗ FAILED${colors.reset}: success: false`);
      console.log(`  Error:`, data.error);
      return false;
    }
    
    // Run custom validator if provided
    if (validator) {
      const validation = validator(data);
      if (!validation.valid) {
        results.failed.push({ name, error: validation.error, data });
        console.log(`  ${colors.red}✗ FAILED${colors.reset}: ${validation.error}`);
        return false;
      }
      if (validation.warnings) {
        validation.warnings.forEach(w => {
          results.warnings.push({ name, warning: w });
          console.log(`  ${colors.yellow}⚠ WARNING${colors.reset}: ${w}`);
        });
      }
    }
    
    results.passed.push({ name, data });
    console.log(`  ${colors.green}✓ PASSED${colors.reset}`);
    return true;
  } catch (error) {
    results.failed.push({ name, error: error.message });
    console.log(`  ${colors.red}✗ FAILED${colors.reset}: ${error.message}`);
    return false;
  }
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

function validateBusinessUnits(data) {
  if (!Array.isArray(data.data)) {
    return { valid: false, error: 'data is not an array' };
  }
  
  const warnings = [];
  data.data.forEach((bu, i) => {
    if (!bu.id) warnings.push(`BU[${i}] missing id`);
    if (!bu.name) warnings.push(`BU[${i}] missing name`);
    if (bu.id === undefined) warnings.push(`BU[${i}] id is undefined`);
  });
  
  return { valid: true, warnings: warnings.length > 0 ? warnings : null };
}

function validateHierarchy(data) {
  if (!data.data || !data.data.departments || !data.data.brands) {
    return { valid: false, error: 'Missing departments or brands' };
  }
  
  const warnings = [];
  
  // Check departments structure
  if (!Array.isArray(data.data.departments)) {
    return { valid: false, error: 'departments is not an array' };
  }
  
  data.data.departments.forEach((dept, i) => {
    if (!dept.id) warnings.push(`Department[${i}] missing id`);
    if (!dept.name) warnings.push(`Department[${i}] missing name`);
    if (!Array.isArray(dept.classes)) warnings.push(`Department[${i}] classes is not an array`);
    
    // Check nested classes
    if (Array.isArray(dept.classes)) {
      dept.classes.forEach((cls, j) => {
        if (!cls.id) warnings.push(`Department[${i}].Class[${j}] missing id`);
        if (!cls.name) warnings.push(`Department[${i}].Class[${j}] missing name`);
        if (!Array.isArray(cls.subclasses)) warnings.push(`Department[${i}].Class[${j}] subclasses is not an array`);
      });
    }
  });
  
  return { valid: true, warnings: warnings.length > 0 ? warnings : null };
}

function validateReviewGrid(data) {
  if (!data.data || !data.data.products) {
    return { valid: false, error: 'Missing products array' };
  }
  
  const warnings = [];
  
  // Check pagination fields
  if (typeof data.data.total !== 'number') warnings.push('total is not a number');
  if (typeof data.data.page !== 'number') warnings.push('page is not a number');
  if (typeof data.data.pageSize !== 'number') warnings.push('pageSize is not a number');
  if (typeof data.data.totalPages !== 'number') warnings.push('totalPages is not a number');
  
  // Check product structure
  if (data.data.products.length > 0) {
    const product = data.data.products[0];
    if (!product.style_id) warnings.push('Product missing style_id');
    if (!product.color_id) warnings.push('Product missing color_id');
    if (typeof product.total_attributes !== 'number') warnings.push('Product total_attributes is not a number');
    if (typeof product.completed_attributes !== 'number') warnings.push('Product completed_attributes is not a number');
    if (typeof product.overall_confidence !== 'number') warnings.push('Product overall_confidence is not a number');
    if (!product.status) warnings.push('Product missing status');
  }
  
  return { valid: true, warnings: warnings.length > 0 ? warnings : null };
}

function validateBulkComparison(data) {
  if (!Array.isArray(data.data)) {
    return { valid: false, error: 'data is not an array' };
  }
  
  const warnings = [];
  
  data.data.forEach((item, i) => {
    if (!item.style_id) warnings.push(`Item[${i}] missing style_id`);
    if (!item.color_id) warnings.push(`Item[${i}] missing color_id`);
    if (!Array.isArray(item.grouped_attributes)) {
      warnings.push(`Item[${i}] grouped_attributes is not an array`);
    } else {
      item.grouped_attributes.forEach((group, j) => {
        if (!group.group_id) warnings.push(`Item[${i}].Group[${j}] missing group_id`);
        if (!group.group_name) warnings.push(`Item[${i}].Group[${j}] missing group_name`);
        if (!Array.isArray(group.attributes)) warnings.push(`Item[${i}].Group[${j}] attributes is not an array`);
      });
    }
  });
  
  return { valid: true, warnings: warnings.length > 0 ? warnings : null };
}

function validateProducts(data) {
  if (!Array.isArray(data.data)) {
    return { valid: false, error: 'data is not an array' };
  }
  
  const warnings = [];
  
  if (data.data.length > 0) {
    const product = data.data[0];
    if (!product.STYLE_ID && !product.style_id) warnings.push('Product missing style_id');
    if (!product.BUSINESS_UNIT_ID && !product.business_unit_id) warnings.push('Product missing business_unit_id');
  }
  
  return { valid: true, warnings: warnings.length > 0 ? warnings : null };
}

function validateDashboardStats(data) {
  if (!data.data) {
    return { valid: false, error: 'Missing data object' };
  }
  
  const warnings = [];
  const stats = data.data;
  
  // Check expected fields
  if (typeof stats.totalProducts !== 'number') warnings.push('totalProducts is not a number');
  if (typeof stats.completedProducts !== 'number') warnings.push('completedProducts is not a number');
  if (typeof stats.incompleteProducts !== 'number') warnings.push('incompleteProducts is not a number');
  
  return { valid: true, warnings: warnings.length > 0 ? warnings : null };
}

// =============================================================================
// RUN TESTS
// =============================================================================

async function runAllTests() {
  console.log(`\n${colors.cyan}${'='.repeat(80)}`);
  console.log('API VALIDATION - Testing All Endpoints');
  console.log(`${'='.repeat(80)}${colors.reset}\n`);
  
  // 1. Health Check
  await testAPI(
    'Health Check',
    `${BASE_URL}/health`
  );
  
  // 2. Business Units
  await testAPI(
    'Business Units',
    `${BASE_URL}/business-units`,
    {},
    validateBusinessUnits
  );
  
  // 3. Hierarchy (Cascading Dropdowns)
  await testAPI(
    'Hierarchy (Cascading Dropdowns)',
    `${BASE_URL}/products/hierarchy?business_unit_id=${BUSINESS_UNIT_ID}`,
    {},
    validateHierarchy
  );
  
  // 4. Products List
  await testAPI(
    'Products List',
    `${BASE_URL}/products?business_unit_id=${BUSINESS_UNIT_ID}`,
    {},
    validateProducts
  );
  
  // 5. Products Filters
  await testAPI(
    'Products Filters',
    `${BASE_URL}/products/filters?business_unit_id=${BUSINESS_UNIT_ID}`
  );
  
  // 6. Review Grid Products (Requires department_id)
  await testAPI(
    'Review Grid Products',
    `${BASE_URL}/attributes/review/grid?business_unit_id=${BUSINESS_UNIT_ID}&department_id=MNFT&page=1&page_size=50`,
    {},
    validateReviewGrid
  );
  
  // 7. Bulk Attribute Comparison
  await testAPI(
    'Bulk Attribute Comparison (/compare/bulk)',
    `${BASE_URL}/attributes/compare/bulk`,
    {
      method: 'POST',
      body: JSON.stringify({
        business_unit_id: BUSINESS_UNIT_ID,
        style_ids: ['1000', '1001']
      })
    },
    validateBulkComparison
  );
  
  // 8. Dashboard Stats
  await testAPI(
    'Dashboard Stats',
    `${BASE_URL}/dashboard/stats?business_unit_id=${BUSINESS_UNIT_ID}`,
    {},
    validateDashboardStats
  );
  
  // 9. Attribute Groups
  await testAPI(
    'Attribute Groups',
    `${BASE_URL}/groups?business_unit_id=${BUSINESS_UNIT_ID}`
  );
  
  // 10. Attribute Groups Tree
  await testAPI(
    'Attribute Groups Tree',
    `${BASE_URL}/groups/tree?business_unit_id=${BUSINESS_UNIT_ID}`
  );
  
  // 11. Library Types
  await testAPI(
    'Library Types',
    `${BASE_URL}/library/types?business_unit_id=${BUSINESS_UNIT_ID}`
  );
  
  // 12. Library Values
  await testAPI(
    'Library Values',
    `${BASE_URL}/library/values?business_unit_id=${BUSINESS_UNIT_ID}`
  );
  
  // 13. Library Mappings
  await testAPI(
    'Library Mappings',
    `${BASE_URL}/library/mappings?business_unit_id=${BUSINESS_UNIT_ID}`
  );
  
  // 14. Library Templates
  await testAPI(
    'Library Templates',
    `${BASE_URL}/library/templates?business_unit_id=${BUSINESS_UNIT_ID}`
  );
  
  // =============================================================================
  // SUMMARY
  // =============================================================================
  
  console.log(`\n${colors.cyan}${'='.repeat(80)}`);
  console.log('VALIDATION SUMMARY');
  console.log(`${'='.repeat(80)}${colors.reset}\n`);
  
  console.log(`${colors.green}✓ PASSED${colors.reset}: ${results.passed.length}`);
  console.log(`${colors.red}✗ FAILED${colors.reset}: ${results.failed.length}`);
  console.log(`${colors.yellow}⚠ WARNINGS${colors.reset}: ${results.warnings.length}`);
  
  if (results.failed.length > 0) {
    console.log(`\n${colors.red}Failed Tests:${colors.reset}`);
    results.failed.forEach(f => {
      console.log(`  - ${f.name}: ${f.error}`);
    });
  }
  
  if (results.warnings.length > 0) {
    console.log(`\n${colors.yellow}Warnings:${colors.reset}`);
    results.warnings.forEach(w => {
      console.log(`  - ${w.name}: ${w.warning}`);
    });
  }
  
  console.log(`\n${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
  
  // Exit with error code if any tests failed
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(err => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, err);
  process.exit(1);
});

