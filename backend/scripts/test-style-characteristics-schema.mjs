/**
 * Test script: Check STYLE_CHARACTERISTICS table schema
 * 
 * Purpose: Verify column names to fix API query
 */

import oracledb from 'oracledb';

const config = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1'
};

async function checkSchema() {
  let conn;
  
  try {
    conn = await oracledb.getConnection(config);
    
    console.log('✅ Connected to Oracle');
    
    // Check STYLE_CHARACTERISTICS columns
    const result = await conn.execute(
      `SELECT column_name, data_type 
       FROM user_tab_columns 
       WHERE table_name = 'STYLE_CHARACTERISTICS' 
       ORDER BY column_id`
    );
    
    console.log('\n📋 STYLE_CHARACTERISTICS columns:');
    result.rows.forEach(([col, type]) => {
      console.log(`  - ${col} (${type})`);
    });
    
    // Check if table has any data
    const countResult = await conn.execute(
      `SELECT COUNT(*) as cnt FROM style_characteristics WHERE ROWNUM <= 1`
    );
    
    const hasData = countResult.rows[0][0] > 0;
    console.log(`\n📊 Table has data: ${hasData ? 'YES' : 'NO'}`);
    
    if (hasData) {
      // Show sample row
      const sampleResult = await conn.execute(
        `SELECT * FROM style_characteristics WHERE ROWNUM = 1`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      console.log('\n🔍 Sample row columns:');
      console.log(Object.keys(sampleResult.rows[0]).join(', '));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (conn) {
      await conn.close();
      console.log('\n✅ Connection closed');
    }
  }
}

checkSchema();

