/**
 * Check STYLES table schema
 */

import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function checkStylesSchema() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: 'attr_mgr',
      password: 'attr_mgr_dev',
      connectString: 'localhost:1521/FREEPDB1',
      connectionTimeout: 10000
    });

    console.log('📋 Checking STYLES table structure (via MERCH_REMOTE):\n');
    
    const result = await conn.execute(`
      SELECT column_name, data_type, nullable
      FROM all_tab_columns@MERCH_REMOTE
      WHERE owner = 'MERCH' AND table_name = 'STYLES'
      ORDER BY column_id
    `);
    
    console.log(`Found ${result.rows.length} columns in STYLES table\n`);
    
    console.log('All columns:');
    result.rows.forEach((row, idx) => {
      console.log(`  ${(idx + 1).toString().padStart(2, ' ')}. ${row.COLUMN_NAME.padEnd(30, ' ')} ${row.DATA_TYPE.padEnd(15, ' ')} ${row.NULLABLE === 'N' ? 'NOT NULL' : 'NULLABLE'}`);
    });
    
    const hasColorId = result.rows.find(r => r.COLUMN_NAME === 'COLOR_ID');
    console.log('\n🔍 COLOR_ID column:', hasColorId ? '✅ EXISTS' : '❌ DOES NOT EXIST');
    
    if (!hasColorId) {
      console.log('\n❌ PROBLEM IDENTIFIED: STYLES table has no COLOR_ID column!');
      console.log('This explains the ORA-00904 error we\'re seeing in getVendorAttributes().');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (err) {
        console.error('Error closing connection:', err.message);
      }
    }
  }
}

checkStylesSchema().catch(console.error);

