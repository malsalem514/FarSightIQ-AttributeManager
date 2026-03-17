#!/usr/bin/env node
/**
 * Create Test Hierarchy Rules
 * 
 * Creates sample hierarchy rules for E2E testing
 * Maps attribute groups to MERCH hierarchies (Class/Subclass)
 */

import oracledb from 'oracledb';

const connection = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1'
};

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function createRules() {
  let conn;
  
  try {
    console.log('🔌 Connecting to database...');
    conn = await oracledb.getConnection(connection);
    console.log('✅ Connected!\n');

    console.log('='.repeat(80));
    console.log('🗑️  CLEANUP: Delete existing test rules');
    console.log('='.repeat(80));
    
    const cleanup = await conn.execute(`
      DELETE FROM ATTR_MGR.CHARACTERISTIC_HIERARCHY_RULES
      WHERE BUSINESS_UNIT_ID = 65
    `, {}, { autoCommit: false });
    
    console.log(`✅ Deleted ${cleanup.rowsAffected} existing rules\n`);

    console.log('='.repeat(80));
    console.log('📋 CREATE: Test Hierarchy Rules');
    console.log('='.repeat(80));

    // Rule 1: APPAREL_GROUP for CASUAL > TOPS
    console.log('\n1️⃣  Rule: APPAREL_GROUP → Class 10 (CASUAL) > Subclass 100 (TOPS)');
    
    const rule1 = await conn.execute(`
      DECLARE
        v_rule_id NUMBER;
      BEGIN
        ATTR_GROUPING_PKG.create_hierarchy_rule(
          p_business_unit_id => 65,
          p_group_id => 'APPAREL_GROUP',
          p_department_id => NULL,
          p_class_id => '10',
          p_subclass_id => '100',
          p_mandatory => 'N',
          p_apply_to_children => 'N',
          p_rule_id => v_rule_id
        );
        :ruleId := v_rule_id;
      END;
    `, {
      ruleId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    }, { autoCommit: false });
    
    console.log(`   ✅ Created Rule ID: ${rule1.outBinds.ruleId}`);

    // Rule 2: COLOR_GROUP for Formal Wear
    console.log('\n2️⃣  Rule: COLOR_GROUP → Class 215 (BLUSA Formal) > Subclass 12 (Manga Corta)');
    
    const rule2 = await conn.execute(`
      DECLARE
        v_rule_id NUMBER;
      BEGIN
        ATTR_GROUPING_PKG.create_hierarchy_rule(
          p_business_unit_id => 65,
          p_group_id => 'COLOR_GROUP',
          p_department_id => NULL,
          p_class_id => '215',
          p_subclass_id => '12',
          p_mandatory => 'N',
          p_apply_to_children => 'N',
          p_rule_id => v_rule_id
        );
        :ruleId := v_rule_id;
      END;
    `, {
      ruleId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    }, { autoCommit: false });
    
    console.log(`   ✅ Created Rule ID: ${rule2.outBinds.ruleId}`);

    // Rule 3: SIZE_GROUP for Formal Wear
    console.log('\n3️⃣  Rule: SIZE_GROUP → Class 215 (BLUSA Formal) > Subclass 12 (Manga Corta)');
    
    const rule3 = await conn.execute(`
      DECLARE
        v_rule_id NUMBER;
      BEGIN
        ATTR_GROUPING_PKG.create_hierarchy_rule(
          p_business_unit_id => 65,
          p_group_id => 'SIZE_GROUP',
          p_department_id => NULL,
          p_class_id => '215',
          p_subclass_id => '12',
          p_mandatory => 'Y',
          p_apply_to_children => 'N',
          p_rule_id => v_rule_id
        );
        :ruleId := v_rule_id;
      END;
    `, {
      ruleId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    }, { autoCommit: false });
    
    console.log(`   ✅ Created Rule ID: ${rule3.outBinds.ruleId} (MANDATORY)`);

    // Rule 4: MATERIAL_GROUP for Hakama Suits
    console.log('\n4️⃣  Rule: MATERIAL_GROUP → Class 0003 (Hakama Suits) > Subclass 0003 (Polyester Hakama)');
    
    const rule4 = await conn.execute(`
      DECLARE
        v_rule_id NUMBER;
      BEGIN
        ATTR_GROUPING_PKG.create_hierarchy_rule(
          p_business_unit_id => 65,
          p_group_id => 'MATERIAL_GROUP',
          p_department_id => NULL,
          p_class_id => '0003',
          p_subclass_id => '0003',
          p_mandatory => 'N',
          p_apply_to_children => 'N',
          p_rule_id => v_rule_id
        );
        :ruleId := v_rule_id;
      END;
    `, {
      ruleId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    }, { autoCommit: false });
    
    console.log(`   ✅ Created Rule ID: ${rule4.outBinds.ruleId}`);

    // Commit all rules
    await conn.commit();
    console.log('\n✅ All rules committed!\n');

    // Verify rules created
    console.log('='.repeat(80));
    console.log('🔍 VERIFY: Rules Created');
    console.log('='.repeat(80));
    
    const verify = await conn.execute(`
      SELECT 
        RULE_ID, 
        GROUP_ID, 
        CLASS_ID, 
        SUBCLASS_ID, 
        MANDATORY
      FROM ATTR_MGR.CHARACTERISTIC_HIERARCHY_RULES
      WHERE BUSINESS_UNIT_ID = 65
      ORDER BY RULE_ID
    `);
    
    console.log(`\nFound ${verify.rows.length} rules:\n`);
    verify.rows.forEach(row => {
      const mandatory = row.MANDATORY === 'Y' ? '⚠️  MANDATORY' : '';
      console.log(`  Rule ${row.RULE_ID}: ${row.GROUP_ID} → Class ${row.CLASS_ID}, Subclass ${row.SUBCLASS_ID} ${mandatory}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ SUCCESS! Test hierarchy rules created');
    console.log('='.repeat(80));
    console.log('\n🎯 Next Steps:');
    console.log('  1. Test API: curl "http://localhost:3002/api/groups/hierarchy-rules/applicable?business_unit_id=65&department_id=&class_id=10&subclass_id=100"');
    console.log('  2. Rerun E2E: node e2e-attribute-grouping.mjs');
    console.log('  3. Expected: Accordion groups should render!\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (conn) {
      await conn.rollback();
      console.log('🔄 Rolled back transaction');
    }
    throw err;
  } finally {
    if (conn) {
      await conn.close();
    }
  }
}

createRules().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

