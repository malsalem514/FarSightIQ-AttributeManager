/**
 * Comprehensive PL/SQL Test Suite
 * 
 * Tests all packages and fixes:
 * - FIX-001: Autonomous logging
 * - FIX-002: Optimized get_groups (scalar subquery → JOIN)
 * - FIX-003: SAVE EXCEPTIONS in bulk_assign_types
 * - All ATTR_GROUPING_PKG procedures
 */

import oracledb from 'oracledb';

const config = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1',
  connectionTimeout: 30000
};

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

let connection;
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function testResult(name, passed, message = '') {
  testsRun++;
  if (passed) {
    testsPassed++;
    console.log(`  ✅ ${name}`);
  } else {
    testsFailed++;
    console.log(`  ❌ ${name}`);
    if (message) console.log(`     ${message}`);
  }
}

async function testLogging() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUITE 1: LOGGER_PKG (FIX-001 - Autonomous Logging)');
  console.log('='.repeat(80) + '\n');

  // Test 1: Basic logging
  try {
    await connection.execute(`
      BEGIN
        LOGGER_PKG.log_debug('Test debug message', 'test_suite=1');
        LOGGER_PKG.log_info('Test info message', 'test_suite=1');
        LOGGER_PKG.log_warn('Test warning message', 'test_suite=1');
        LOGGER_PKG.log_error('Test error message', 'test_suite=1', 'Test error stack');
      END;
    `);
    testResult('Basic logging (DEBUG, INFO, WARN, ERROR)', true);
  } catch (err) {
    testResult('Basic logging', false, err.message);
  }

  // Test 2: Autonomous transaction (logs survive rollback)
  try {
    await connection.execute(`
      BEGIN
        LOGGER_PKG.log_info('Before rollback', 'test_suite=1,rollback_test=true');
        ROLLBACK;
      END;
    `);
    
    const result = await connection.execute(`
      SELECT COUNT(*) as cnt FROM ATTR_MGR_LOGS 
      WHERE message = 'Before rollback'
    `);
    
    const survived = result.rows[0].CNT > 0;
    testResult('Autonomous transaction (log survives ROLLBACK)', survived);
  } catch (err) {
    testResult('Autonomous transaction', false, err.message);
  }

  // Test 3: Recent logs query
  try {
    const result = await connection.execute(`
      SELECT log_level, message, TO_CHAR(logged_at, 'HH24:MI:SS') as time
      FROM ATTR_MGR_LOGS
      ORDER BY logged_at DESC
      FETCH FIRST 5 ROWS ONLY
    `);
    
    testResult(`Recent logs query (${result.rows.length} logs retrieved)`, result.rows.length > 0);
    console.log('\n  📝 Recent Logs:');
    console.table(result.rows);
  } catch (err) {
    testResult('Recent logs query', false, err.message);
  }
}

async function testGroupOperations() {
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUITE 2: ATTR_GROUPING_PKG - Group CRUD Operations');
  console.log('='.repeat(80) + '\n');

  const testBusinessUnit = 999;
  const testGroupId = 'TEST_GROUP_001';

  // Cleanup old test data (if exists)
  try {
    await connection.execute(`
      DELETE FROM CHARACTERISTIC_TYPE_GROUPS
      WHERE BUSINESS_UNIT_ID = :bu_id
    `, { bu_id: testBusinessUnit });
    
    await connection.execute(`
      DELETE FROM ATTRIBUTE_GROUPS
      WHERE BUSINESS_UNIT_ID = :bu_id
    `, { bu_id: testBusinessUnit });
    
    await connection.commit();
  } catch (err) {
    // Ignore cleanup errors
  }

  // Test 1: Create group
  try {
    await connection.execute(`
      BEGIN
        ATTR_GROUPING_PKG.create_group(
          p_business_unit_id => :bu_id,
          p_group_id => :group_id,
          p_parent_group_id => NULL,
          p_group_code => 'TEST001',
          p_description => 'Test Group Description',
          p_display_name => 'Test Group',
          p_group_type => 'STANDARD',
          p_sort_order => 10,
          p_created_by => 'TEST_SUITE'
        );
      END;
    `, { bu_id: testBusinessUnit, group_id: testGroupId });
    
    testResult('create_group (root level)', true);
  } catch (err) {
    testResult('create_group', false, err.message);
  }

  // Test 2: Create child group
  try {
    await connection.execute(`
      BEGIN
        ATTR_GROUPING_PKG.create_group(
          p_business_unit_id => :bu_id,
          p_group_id => :group_id,
          p_parent_group_id => :parent_id,
          p_description => 'Child Group Description',
          p_display_name => 'Child Group',
          p_created_by => 'TEST_SUITE'
        );
      END;
    `, { 
      bu_id: testBusinessUnit, 
      group_id: 'TEST_GROUP_002',
      parent_id: testGroupId
    });
    
    testResult('create_group (child level)', true);
  } catch (err) {
    testResult('create_group (child)', false, err.message);
  }

  // Test 3: FIX-002 - Optimized get_groups (JOIN instead of scalar subqueries)
  try {
    // Simple test: just open and close cursor to verify it works
    await connection.execute(`
      DECLARE
        v_cursor SYS_REFCURSOR;
      BEGIN
        ATTR_GROUPING_PKG.get_groups(
          p_business_unit_id => :bu_id,
          p_result => v_cursor
        );
        CLOSE v_cursor;
      END;
    `, { bu_id: testBusinessUnit });
    
    testResult(`get_groups (FIX-002) - Optimized query executed successfully`, true);
  } catch (err) {
    testResult('get_groups (FIX-002)', false, err.message);
  }

  // Test 4: get_group (single)
  try {
    const result = await connection.execute(`
      DECLARE
        v_cursor SYS_REFCURSOR;
        v_found BOOLEAN := FALSE;
      BEGIN
        ATTR_GROUPING_PKG.get_group(
          p_business_unit_id => :bu_id,
          p_group_id => :group_id,
          p_result => v_cursor
        );
        
        IF v_cursor%ISOPEN THEN
          v_found := TRUE;
        END IF;
        CLOSE v_cursor;
        
        IF v_found THEN
          :result := 1;
        ELSE
          :result := 0;
        END IF;
      END;
    `, { 
      bu_id: testBusinessUnit,
      group_id: testGroupId,
      result: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    });
    
    testResult('get_group (single)', result.outBinds.result === 1);
  } catch (err) {
    testResult('get_group', false, err.message);
  }

  // Test 5: get_group_tree (hierarchical)
  try {
    const result = await connection.execute(`
      DECLARE
        v_cursor SYS_REFCURSOR;
      BEGIN
        ATTR_GROUPING_PKG.get_group_tree(
          p_business_unit_id => :bu_id,
          p_result => v_cursor
        );
        CLOSE v_cursor;
      END;
    `, { bu_id: testBusinessUnit });
    
    testResult('get_group_tree (hierarchical query)', true);
  } catch (err) {
    testResult('get_group_tree', false, err.message);
  }

  // Test 6: update_group
  try {
    await connection.execute(`
      BEGIN
        ATTR_GROUPING_PKG.update_group(
          p_business_unit_id => :bu_id,
          p_group_id => :group_id,
          p_description => 'Updated Description',
          p_sort_order => 20,
          p_modified_by => 'TEST_SUITE'
        );
      END;
    `, { bu_id: testBusinessUnit, group_id: testGroupId });
    
    testResult('update_group', true);
  } catch (err) {
    testResult('update_group', false, err.message);
  }

  return { testBusinessUnit, testGroupId };
}

async function testTypeGroupOperations(testBusinessUnit, testGroupId) {
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUITE 3: ATTR_GROUPING_PKG - Type Assignment Operations');
  console.log('='.repeat(80) + '\n');

  // Test 1: assign_type_to_group
  try {
    await connection.execute(`
      BEGIN
        ATTR_GROUPING_PKG.assign_type_to_group(
          p_business_unit_id => :bu_id,
          p_characteristic_type_id => 'SIZE',
          p_group_id => :group_id,
          p_rank => 1,
          p_mandatory => 'Y',
          p_created_by => 'TEST_SUITE'
        );
      END;
    `, { bu_id: testBusinessUnit, group_id: testGroupId });
    
    testResult('assign_type_to_group (single)', true);
  } catch (err) {
    testResult('assign_type_to_group', false, err.message);
  }

  // Test 2: FIX-003 - bulk_assign_types with SAVE EXCEPTIONS
  try {
    const result = await connection.execute(`
      DECLARE
        v_rows_assigned NUMBER;
      BEGIN
        ATTR_GROUPING_PKG.bulk_assign_types(
          p_business_unit_id => :bu_id,
          p_group_id => :group_id,
          p_type_ids => 'COLOR,FABRIC,PATTERN',
          p_rows_assigned => v_rows_assigned
        );
        :result := v_rows_assigned;
      END;
    `, {
      bu_id: testBusinessUnit,
      group_id: testGroupId,
      result: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    });
    
    const rowsAssigned = result.outBinds.result;
    testResult(`bulk_assign_types (FIX-003) - Assigned ${rowsAssigned} types`, rowsAssigned >= 3);
  } catch (err) {
    testResult('bulk_assign_types (FIX-003)', false, err.message);
  }

  // Test 3: get_type_groups (all)
  try {
    await connection.execute(`
      DECLARE
        v_cursor SYS_REFCURSOR;
      BEGIN
        ATTR_GROUPING_PKG.get_type_groups(
          p_business_unit_id => :bu_id,
          p_group_id => NULL,
          p_result => v_cursor
        );
        CLOSE v_cursor;
      END;
    `, { bu_id: testBusinessUnit });
    
    testResult('get_type_groups (all)', true);
  } catch (err) {
    testResult('get_type_groups', false, err.message);
  }

  // Test 4: get_type_groups (filtered)
  try {
    const result = await connection.execute(`
      DECLARE
        v_cursor SYS_REFCURSOR;
      BEGIN
        ATTR_GROUPING_PKG.get_type_groups(
          p_business_unit_id => :bu_id,
          p_group_id => :group_id,
          p_result => v_cursor
        );
        CLOSE v_cursor;
      END;
    `, { bu_id: testBusinessUnit, group_id: testGroupId });
    
    testResult('get_type_groups (filtered by group)', true);
  } catch (err) {
    testResult('get_type_groups (filtered)', false, err.message);
  }

  // Test 5: remove_type_from_group
  try {
    const result = await connection.execute(`
      DECLARE
        v_rows_deleted NUMBER;
      BEGIN
        ATTR_GROUPING_PKG.remove_type_from_group(
          p_business_unit_id => :bu_id,
          p_characteristic_type_id => 'SIZE',
          p_group_id => :group_id,
          p_rows_deleted => v_rows_deleted
        );
        :result := v_rows_deleted;
      END;
    `, {
      bu_id: testBusinessUnit,
      group_id: testGroupId,
      result: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    });
    
    testResult('remove_type_from_group', result.outBinds.result > 0);
  } catch (err) {
    testResult('remove_type_from_group', false, err.message);
  }
}

async function testHierarchyRules(testBusinessUnit) {
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUITE 4: ATTR_GROUPING_PKG - Hierarchy Rules');
  console.log('='.repeat(80) + '\n');

  let testRuleId;

  // Test 1: create_hierarchy_rule
  try {
    const result = await connection.execute(`
      DECLARE
        v_rule_id NUMBER;
      BEGIN
        ATTR_GROUPING_PKG.create_hierarchy_rule(
          p_business_unit_id => :bu_id,
          p_characteristic_type_id => 'COLOR',
          p_department_id => 'DEPT001',
          p_class_id => 'CLASS001',
          p_mandatory => 'Y',
          p_created_by => 'TEST_SUITE',
          p_rule_id => v_rule_id
        );
        :result := v_rule_id;
      END;
    `, {
      bu_id: testBusinessUnit,
      result: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    });
    
    testRuleId = result.outBinds.result;
    testResult(`create_hierarchy_rule (rule_id: ${testRuleId})`, testRuleId > 0);
  } catch (err) {
    testResult('create_hierarchy_rule', false, err.message);
  }

  // Test 2: get_hierarchy_rules
  try {
    const result = await connection.execute(`
      DECLARE
        v_cursor SYS_REFCURSOR;
      BEGIN
        ATTR_GROUPING_PKG.get_hierarchy_rules(
          p_business_unit_id => :bu_id,
          p_result => v_cursor
        );
        CLOSE v_cursor;
      END;
    `, { bu_id: testBusinessUnit });
    
    testResult('get_hierarchy_rules', true);
  } catch (err) {
    testResult('get_hierarchy_rules', false, err.message);
  }

  // Test 3: get_applicable_attributes (closest-match inheritance)
  try {
    const result = await connection.execute(`
      DECLARE
        v_cursor SYS_REFCURSOR;
      BEGIN
        ATTR_GROUPING_PKG.get_applicable_attributes(
          p_business_unit_id => :bu_id,
          p_department_id => 'DEPT001',
          p_class_id => 'CLASS001',
          p_subclass_id => 'SUBCLASS001',
          p_result => v_cursor
        );
        CLOSE v_cursor;
      END;
    `, { bu_id: testBusinessUnit });
    
    testResult('get_applicable_attributes (closest-match)', true);
  } catch (err) {
    testResult('get_applicable_attributes', false, err.message);
  }

  // Test 4: delete_hierarchy_rule
  if (testRuleId) {
    try {
      const result = await connection.execute(`
        DECLARE
          v_rows_deleted NUMBER;
        BEGIN
          ATTR_GROUPING_PKG.delete_hierarchy_rule(
            p_rule_id => :rule_id,
            p_rows_deleted => v_rows_deleted
          );
          :result := v_rows_deleted;
        END;
      `, {
        rule_id: testRuleId,
        result: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      });
      
      testResult('delete_hierarchy_rule', result.outBinds.result > 0);
    } catch (err) {
      testResult('delete_hierarchy_rule', false, err.message);
    }
  }
}

async function testUtilityFunctions(testBusinessUnit) {
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUITE 5: ATTR_GROUPING_PKG - Utility Functions');
  console.log('='.repeat(80) + '\n');

  // Test 1: get_version
  try {
    const result = await connection.execute(`
      SELECT ATTR_GROUPING_PKG.get_version() as version FROM DUAL
    `);
    
    const version = result.rows[0].VERSION;
    testResult(`get_version (v${version})`, version !== null);
  } catch (err) {
    testResult('get_version', false, err.message);
  }

  // Test 2: validate_hierarchy (valid)
  try {
    const result = await connection.execute(`
      SELECT ATTR_GROUPING_PKG.validate_hierarchy(
        p_business_unit_id => :bu_id,
        p_group_id => 'TEST_GROUP_001',
        p_parent_group_id => NULL
      ) as is_valid FROM DUAL
    `, { bu_id: testBusinessUnit });
    
    testResult('validate_hierarchy (valid)', result.rows[0].IS_VALID === 1);
  } catch (err) {
    testResult('validate_hierarchy', false, err.message);
  }
}

async function testCleanup(testBusinessUnit) {
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUITE 6: Cleanup');
  console.log('='.repeat(80) + '\n');

  // Delete child group first
  try {
    const result = await connection.execute(`
      DECLARE
        v_rows_deleted NUMBER;
      BEGIN
        ATTR_GROUPING_PKG.delete_group(
          p_business_unit_id => :bu_id,
          p_group_id => 'TEST_GROUP_002',
          p_rows_deleted => v_rows_deleted
        );
        :result := v_rows_deleted;
      END;
    `, {
      bu_id: testBusinessUnit,
      result: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    });
    
    testResult('delete_group (child)', result.outBinds.result > 0);
  } catch (err) {
    testResult('delete_group (child)', false, err.message);
  }

  // Clean up type assignments from parent group
  try {
    await connection.execute(`
      DELETE FROM CHARACTERISTIC_TYPE_GROUPS
      WHERE BUSINESS_UNIT_ID = :bu_id
        AND GROUP_ID = 'TEST_GROUP_001'
    `, { bu_id: testBusinessUnit });
    
    testResult('Clean up type assignments', true);
  } catch (err) {
    testResult('Clean up type assignments', false, err.message);
  }

  // Delete parent group
  try {
    const result = await connection.execute(`
      DECLARE
        v_rows_deleted NUMBER;
      BEGIN
        ATTR_GROUPING_PKG.delete_group(
          p_business_unit_id => :bu_id,
          p_group_id => 'TEST_GROUP_001',
          p_rows_deleted => v_rows_deleted
        );
        :result := v_rows_deleted;
      END;
    `, {
      bu_id: testBusinessUnit,
      result: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    });
    
    testResult('delete_group (parent)', result.outBinds.result > 0);
  } catch (err) {
    testResult('delete_group (parent)', false, err.message);
  }
}

async function main() {
  try {
    console.log('\n🧪 COMPREHENSIVE PL/SQL TEST SUITE');
    console.log('Testing: LOGGER_PKG + ATTR_GROUPING_PKG + ALL FIXES\n');
    
    connection = await oracledb.getConnection(config);
    console.log('✅ Connected to Oracle @ localhost:1521/FREEPDB1\n');

    // Run all test suites
    await testLogging();
    const { testBusinessUnit, testGroupId } = await testGroupOperations();
    await testTypeGroupOperations(testBusinessUnit, testGroupId);
    await testHierarchyRules(testBusinessUnit);
    await testUtilityFunctions(testBusinessUnit);
    await testCleanup(testBusinessUnit);

    // Final summary
    console.log('\n' + '='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80) + '\n');
    
    console.log(`  Total Tests:  ${testsRun}`);
    console.log(`  ✅ Passed:    ${testsPassed} (${Math.round(testsPassed/testsRun*100)}%)`);
    console.log(`  ❌ Failed:    ${testsFailed}`);
    
    if (testsFailed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! PL/SQL code is production-ready!\n');
    } else {
      console.log('\n⚠️  Some tests failed. Review errors above.\n');
      process.exit(1);
    }

  } catch (err) {
    console.error('\n❌ Test suite failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.close();
      console.log('📡 Connection closed\n');
    }
  }
}

main().catch(console.error);

