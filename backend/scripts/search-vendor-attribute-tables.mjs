/**
 * Search for tables containing vendor attribute columns
 * (VENDOR_COMPOSITION, VENDOR_CARE, VENDOR_ORIGIN)
 */

import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function searchVendorAttributeTables() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: 'attr_mgr',
      password: 'attr_mgr_dev',
      connectString: 'localhost:1521/FREEPDB1',
      connectionTimeout: 10000
    });

    console.log('🔍 Searching for tables with VENDOR_COMPOSITION, VENDOR_CARE, VENDOR_ORIGIN columns...\n');
    
    const searchTerms = ['VENDOR_COMPOSITION', 'VENDOR_CARE', 'VENDOR_ORIGIN'];
    
    for (const term of searchTerms) {
      console.log(`\n📋 Searching for ${term}:\n`);
      
      const result = await conn.execute(`
        SELECT table_name, column_name, data_type, nullable
        FROM all_tab_columns@MERCH_REMOTE
        WHERE owner = 'MERCH' 
          AND column_name = :term
        ORDER BY table_name
      `, { term });
      
      if (result.rows.length === 0) {
        console.log(`  ❌ No tables found with ${term} column`);
      } else {
        console.log(`  ✅ Found ${result.rows.length} table(s):\n`);
        result.rows.forEach((row) => {
          console.log(`     - ${row.TABLE_NAME.padEnd(30, ' ')} (${row.DATA_TYPE}, ${row.NULLABLE === 'N' ? 'NOT NULL' : 'NULLABLE'})`);
        });
      }
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

searchVendorAttributeTables().catch(console.error);

