/**
 * Test Groups API Endpoints
 * 
 * Tests all REST endpoints for attribute grouping system
 * Requires backend server running on http://localhost:3000
 */

const API_BASE = 'http://localhost:3002/api';
const BUSINESS_UNIT_ID = 999; // Test business unit

let createdGroupId = null;
let createdRuleId = null;

async function request(method, path, body = null) {
  const url = `${API_BASE}${path}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  return { status: response.status, data };
}

function testResult(name, passed, message = '') {
  if (passed) {
    console.log(`  ✅ ${name}`);
  } else {
    console.log(`  ❌ ${name}`);
    if (message) console.log(`     ${message}`);
  }
  return passed;
}

async function testHealthCheck() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 1: Health Check');
  console.log('='.repeat(80) + '\n');
  
  try {
    const { status, data } = await request('GET', '/health');
    testResult('GET /api/health', status === 200 && data.status === 'ok', 
               status !== 200 ? `Status: ${status}` : '');
  } catch (error) {
    testResult('GET /api/health', false, error.message);
  }
}

async function testPackageVersion() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: Package Version');
  console.log('='.repeat(80) + '\n');
  
  try {
    const { status, data } = await request('GET', '/groups/version');
    testResult('GET /api/groups/version', 
               status === 200 && data.success && data.version, 
               data.version ? `Version: ${data.version}` : '');
  } catch (error) {
    testResult('GET /api/groups/version', false, error.message);
  }
}

async function testCreateGroup() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 3: Create Group');
  console.log('='.repeat(80) + '\n');
  
  // Cleanup old test data first
  try {
    await request('DELETE', `/groups/TEST_API_GROUP_001?business_unit_id=${BUSINESS_UNIT_ID}`);
  } catch (e) {
    // Ignore if doesn't exist
  }
  
  try {
    const { status, data } = await request('POST', '/groups', {
      business_unit_id: BUSINESS_UNIT_ID,
      group_id: 'TEST_API_GROUP_001',
      description: 'Test Group from API',
      display_name: 'Test API Group',
      group_type: 'STANDARD',
      sort_order: 10
    });
    
    const passed = status === 201 && data.success;
    testResult('POST /api/groups', passed, 
               !passed ? `Status: ${status}, Message: ${data.error?.message}` : '');
    
    if (passed) {
      createdGroupId = 'TEST_API_GROUP_001';
    }
  } catch (error) {
    testResult('POST /api/groups', false, error.message);
  }
}

async function testGetGroups() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 4: Get Groups');
  console.log('='.repeat(80) + '\n');
  
  try {
    const { status, data } = await request('GET', `/groups?business_unit_id=${BUSINESS_UNIT_ID}`);
    const passed = status === 200 && data.success && Array.isArray(data.data);
    testResult('GET /api/groups', passed, 
               passed ? `Found ${data.count} groups` : `Status: ${status}`);
  } catch (error) {
    testResult('GET /api/groups', false, error.message);
  }
}

async function testGetGroupTree() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 5: Get Group Tree');
  console.log('='.repeat(80) + '\n');
  
  try {
    const { status, data } = await request('GET', `/groups/tree?business_unit_id=${BUSINESS_UNIT_ID}`);
    const passed = status === 200 && data.success && Array.isArray(data.data);
    testResult('GET /api/groups/tree', passed, 
               passed ? `Found ${data.count} groups in tree` : `Status: ${status}`);
  } catch (error) {
    testResult('GET /api/groups/tree', false, error.message);
  }
}

async function testGetSingleGroup() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 6: Get Single Group');
  console.log('='.repeat(80) + '\n');
  
  if (!createdGroupId) {
    testResult('GET /api/groups/:id', false, 'No group created in previous test');
    return;
  }
  
  try {
    const { status, data } = await request('GET', 
      `/groups/${createdGroupId}?business_unit_id=${BUSINESS_UNIT_ID}`);
    const passed = status === 200 && data.success && data.data;
    testResult('GET /api/groups/:id', passed, 
               passed ? `Group: ${data.data.DESCRIPTION}` : `Status: ${status}`);
  } catch (error) {
    testResult('GET /api/groups/:id', false, error.message);
  }
}

async function testUpdateGroup() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 7: Update Group');
  console.log('='.repeat(80) + '\n');
  
  if (!createdGroupId) {
    testResult('PUT /api/groups/:id', false, 'No group created');
    return;
  }
  
  try {
    const { status, data } = await request('PUT', 
      `/groups/${createdGroupId}?business_unit_id=${BUSINESS_UNIT_ID}`, {
        description: 'Updated Test Group Description',
        sort_order: 20
      });
    const passed = status === 200 && data.success;
    testResult('PUT /api/groups/:id', passed, 
               !passed ? `Status: ${status}, Message: ${data.error?.message}` : '');
  } catch (error) {
    testResult('PUT /api/groups/:id', false, error.message);
  }
}

async function testAssignType() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 8: Assign Type to Group');
  console.log('='.repeat(80) + '\n');
  
  if (!createdGroupId) {
    testResult('POST /api/groups/:id/types', false, 'No group created');
    return;
  }
  
  try {
    const { status, data } = await request('POST', 
      `/groups/${createdGroupId}/types?business_unit_id=${BUSINESS_UNIT_ID}`, {
        characteristic_type_id: 'SIZE',
        rank: 1,
        mandatory: true
      });
    const passed = status === 201 && data.success;
    testResult('POST /api/groups/:id/types', passed, 
               !passed ? `Status: ${status}, Message: ${data.error?.message}` : '');
  } catch (error) {
    testResult('POST /api/groups/:id/types', false, error.message);
  }
}

async function testBulkAssignTypes() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 9: Bulk Assign Types');
  console.log('='.repeat(80) + '\n');
  
  if (!createdGroupId) {
    testResult('POST /api/groups/:id/types/bulk', false, 'No group created');
    return;
  }
  
  try {
    const { status, data } = await request('POST', 
      `/groups/${createdGroupId}/types/bulk?business_unit_id=${BUSINESS_UNIT_ID}`, {
        type_ids: ['COLOR', 'FABRIC', 'PATTERN']
      });
    const passed = status === 201 && data.success;
    testResult('POST /api/groups/:id/types/bulk', passed, 
               passed ? `Assigned ${data.rowsAssigned}/${data.totalRequested} types` : 
                       `Status: ${status}`);
  } catch (error) {
    testResult('POST /api/groups/:id/types/bulk', false, error.message);
  }
}

async function testGetAssignedTypes() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 10: Get Assigned Types');
  console.log('='.repeat(80) + '\n');
  
  if (!createdGroupId) {
    testResult('GET /api/groups/:id/types', false, 'No group created');
    return;
  }
  
  try {
    const { status, data } = await request('GET', 
      `/groups/${createdGroupId}/types?business_unit_id=${BUSINESS_UNIT_ID}`);
    const passed = status === 200 && data.success && Array.isArray(data.data);
    testResult('GET /api/groups/:id/types', passed, 
               passed ? `Found ${data.count} assigned types` : `Status: ${status}`);
  } catch (error) {
    testResult('GET /api/groups/:id/types', false, error.message);
  }
}

async function testCreateHierarchyRule() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 11: Create Hierarchy Rule');
  console.log('='.repeat(80) + '\n');
  
  try {
    const { status, data } = await request('POST', '/groups/hierarchy-rules', {
      business_unit_id: BUSINESS_UNIT_ID,
      characteristic_type_id: 'COLOR',
      department_id: 'DEPT001',
      class_id: 'CLASS001',
      mandatory: true
    });
    const passed = status === 201 && data.success && data.ruleId;
    testResult('POST /api/groups/hierarchy-rules', passed, 
               passed ? `Rule ID: ${data.ruleId}` : `Status: ${status}`);
    
    if (passed) {
      createdRuleId = data.ruleId;
    }
  } catch (error) {
    testResult('POST /api/groups/hierarchy-rules', false, error.message);
  }
}

async function testGetHierarchyRules() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 12: Get Hierarchy Rules');
  console.log('='.repeat(80) + '\n');
  
  try {
    const { status, data } = await request('GET', 
      `/groups/hierarchy-rules?business_unit_id=${BUSINESS_UNIT_ID}`);
    const passed = status === 200 && data.success && Array.isArray(data.data);
    testResult('GET /api/groups/hierarchy-rules', passed, 
               passed ? `Found ${data.count} rules` : `Status: ${status}`);
  } catch (error) {
    testResult('GET /api/groups/hierarchy-rules', false, error.message);
  }
}

async function testDeleteHierarchyRule() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 13: Delete Hierarchy Rule');
  console.log('='.repeat(80) + '\n');
  
  if (!createdRuleId) {
    testResult('DELETE /api/groups/hierarchy-rules/:id', false, 'No rule created');
    return;
  }
  
  try {
    const { status, data } = await request('DELETE', `/groups/hierarchy-rules/${createdRuleId}`);
    const passed = status === 200 && data.success;
    testResult('DELETE /api/groups/hierarchy-rules/:id', passed, 
               !passed ? `Status: ${status}` : '');
  } catch (error) {
    testResult('DELETE /api/groups/hierarchy-rules/:id', false, error.message);
  }
}

async function testRemoveType() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 14: Remove Type from Group');
  console.log('='.repeat(80) + '\n');
  
  if (!createdGroupId) {
    testResult('DELETE /api/groups/:id/types/:typeId', false, 'No group created');
    return;
  }
  
  try {
    const { status, data } = await request('DELETE', 
      `/groups/${createdGroupId}/types/SIZE?business_unit_id=${BUSINESS_UNIT_ID}`);
    const passed = status === 200 && data.success;
    testResult('DELETE /api/groups/:id/types/:typeId', passed, 
               !passed ? `Status: ${status}` : '');
  } catch (error) {
    testResult('DELETE /api/groups/:id/types/:typeId', false, error.message);
  }
}

async function testDeleteGroup() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST 15: Delete Group (Cleanup)');
  console.log('='.repeat(80) + '\n');
  
  if (!createdGroupId) {
    testResult('DELETE /api/groups/:id', false, 'No group created');
    return;
  }
  
  // Clean up type assignments first
  try {
    await request('DELETE', 
      `/groups/${createdGroupId}/types/COLOR?business_unit_id=${BUSINESS_UNIT_ID}`);
    await request('DELETE', 
      `/groups/${createdGroupId}/types/FABRIC?business_unit_id=${BUSINESS_UNIT_ID}`);
    await request('DELETE', 
      `/groups/${createdGroupId}/types/PATTERN?business_unit_id=${BUSINESS_UNIT_ID}`);
  } catch (e) {
    // Ignore cleanup errors
  }
  
  try {
    const { status, data } = await request('DELETE', 
      `/groups/${createdGroupId}?business_unit_id=${BUSINESS_UNIT_ID}`);
    const passed = status === 200 && data.success;
    testResult('DELETE /api/groups/:id', passed, 
               !passed ? `Status: ${status}, Message: ${data.error?.message}` : '');
  } catch (error) {
    testResult('DELETE /api/groups/:id', false, error.message);
  }
}

async function main() {
  console.log('\n🧪 GROUPS API TEST SUITE');
  console.log('Testing: REST endpoints for attribute grouping system\n');
  console.log(`API Base: ${API_BASE}`);
  console.log(`Business Unit: ${BUSINESS_UNIT_ID}\n`);
  
  try {
    await testHealthCheck();
    await testPackageVersion();
    await testCreateGroup();
    await testGetGroups();
    await testGetGroupTree();
    await testGetSingleGroup();
    await testUpdateGroup();
    await testAssignType();
    await testBulkAssignTypes();
    await testGetAssignedTypes();
    await testCreateHierarchyRule();
    await testGetHierarchyRules();
    await testDeleteHierarchyRule();
    await testRemoveType();
    await testDeleteGroup();
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ ALL API TESTS COMPLETE');
    console.log('='.repeat(80) + '\n');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);

