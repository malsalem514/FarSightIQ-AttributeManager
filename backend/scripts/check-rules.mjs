#!/usr/bin/env node
/**
 * Check actual rules in database
 */

import oracledb from 'oracledb';

const connection = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1'
};

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function check() {
  let conn;
  
  try {
    conn = await oracledb.getConnection(connection);
    
    const rules = await conn.execute(`
      SELECT *
      FROM ATTR_MGR.CHARACTERISTIC_HIERARCHY_RULES
      WHERE BUSINESS_UNIT_ID = 65
      ORDER BY RULE_ID
    `);
    
    console.log(`Found ${rules.rows.length} rules:\n`);
    rules.rows.forEach(row => {
      console.log(`Rule ${row.RULE_ID}:`);
      console.log(`  GROUP_ID: ${row.GROUP_ID}`);
      console.log(`  CHAR_TYPE_ID: ${row.CHARACTERISTIC_TYPE_ID}`);
      console.log(`  DEPT: ${row.DEPARTMENT_ID}, CLASS: ${row.CLASS_ID}, SUBCLASS: ${row.SUBCLASS_ID}`);
      console.log(`  MANDATORY: ${row.MANDATORY}, ACTIVE: ${row.ACTIVE}\n`);
    });

  } finally {
    if (conn) await conn.close();
  }
}

check();

