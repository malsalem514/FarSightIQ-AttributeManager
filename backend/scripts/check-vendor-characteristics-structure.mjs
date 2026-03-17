/**
 * Check VENDOR_CHARACTERISTICS table structure and sample data
 */

import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function checkVendorCharacteristics() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: 'attr_mgr',
      password: 'attr_mgr_dev',
      connectString: 'localhost:1521/FREEPDB1',
      connectionTimeout: 10000
    });

    // 1. Check table structure
    console.log('📋 VENDOR_CHARACTERISTICS table structure:\n');
    const structureResult = await conn.execute(`
      SELECT column_name, data_type, nullable
      FROM all_tab_columns@MERCH_REMOTE
      WHERE owner = 'MERCH' AND table_name = 'VENDOR_CHARACTERISTICS'
      ORDER BY column_id
    `);
    
    if (structureResult.rows.length > 0) {
      structureResult.rows.forEach((row, idx) => {
        console.log(`  ${(idx + 1).toString().padStart(2, ' ')}. ${row.COLUMN_NAME.padEnd(30, ' ')} ${row.DATA_TYPE.padEnd(15, ' ')} ${row.NULLABLE === 'N' ? 'NOT NULL' : 'NULLABLE'}`);
      });
    }
    
    // 2. Check sample data
    console.log('\n\n📊 Sample data (first 5 rows):\n');
    const sampleResult = await conn.execute(`
      SELECT *
      FROM VENDOR_CHARACTERISTICS@MERCH_REMOTE
      WHERE ROWNUM <= 5
    `);
    
    if (sampleResult.rows.length > 0) {
      console.table(sampleResult.rows);
    } else {
      console.log('  ℹ️  Table is empty');
    }
    
    // 3. Check row count
    const countResult = await conn.execute(`
      SELECT COUNT(*) as row_count
      FROM VENDOR_CHARACTERISTICS@MERCH_REMOTE
    `);
    
    console.log(`\n\n📈 Total rows: ${countResult.rows[0].ROW_COUNT}`);
    
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

checkVendorCharacteristics().catch(console.error);

