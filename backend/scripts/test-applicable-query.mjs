#!/usr/bin/env node
/**
 * Test get_applicable_attributes PL/SQL procedure
 */

import oracledb from 'oracledb';

const connection = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1'
};

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function test() {
  let conn;
  
  try {
    console.log('🔌 Connecting...');
    conn = await oracledb.getConnection(connection);
    console.log('✅ Connected!\n');

    console.log('Testing get_applicable_attributes with:');
    console.log('  BU: 65');
    console.log('  Dept: NULL');
    console.log('  Class: 10');
    console.log('  Subclass: 100\n');

    const result = await conn.execute(`
      BEGIN
        ATTR_GROUPING_PKG.get_applicable_attributes(:buId, :deptId, :classId, :subclassId, :result);
      END;
    `, {
      buId: 65,
      deptId: null,
      classId: '10',
      subclassId: '100',
      result: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
    });
    
    const cursor = result.outBinds.result;
    const rows = await cursor.getRows(1000);
    await cursor.close();
    
    console.log(`Found ${rows.length} applicable attributes:\n`);
    rows.forEach(row => {
      console.log(`  Type: ${row.CHARACTERISTIC_TYPE_ID}, Group: ${row.GROUP_ID}, Mandatory: ${row.MANDATORY}, Match: ${row.MATCH_LEVEL}`);
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    if (conn) {
      await conn.close();
    }
  }
}

test().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

