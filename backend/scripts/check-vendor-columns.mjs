/**
 * Check which VENDOR_* columns exist in STYLES table
 */

import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function checkVendorColumns() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: 'attr_mgr',
      password: 'attr_mgr_dev',
      connectString: 'localhost:1521/FREEPDB1',
      connectionTimeout: 10000
    });

    console.log('📋 Checking VENDOR_* columns in STYLES table (via MERCH_REMOTE):\n');
    
    const result = await conn.execute(`
      SELECT column_name, data_type, nullable
      FROM all_tab_columns@MERCH_REMOTE
      WHERE owner = 'MERCH' 
        AND table_name = 'STYLES'
        AND column_name LIKE 'VENDOR%'
      ORDER BY column_name
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ No VENDOR_* columns found in STYLES table!');
    } else {
      console.log(`✅ Found ${result.rows.length} VENDOR_* columns:\n`);
      result.rows.forEach((row, idx) => {
        console.log(`  ${(idx + 1).toString().padStart(2, ' ')}. ${row.COLUMN_NAME.padEnd(30, ' ')} ${row.DATA_TYPE.padEnd(15, ' ')} ${row.NULLABLE === 'N' ? 'NOT NULL' : 'NULLABLE'}`);
      });
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

checkVendorColumns().catch(console.error);

