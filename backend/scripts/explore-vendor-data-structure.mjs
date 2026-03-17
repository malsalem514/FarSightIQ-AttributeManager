/**
 * Explore how vendor data is actually structured
 */

import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function exploreVendorDataStructure() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: 'attr_mgr',
      password: 'attr_mgr_dev',
      connectString: 'localhost:1521/FREEPDB1',
      connectionTimeout: 10000
    });

    console.log('🔍 Exploring Vendor-Related Tables...\n');
    
    // 1. Check VENDORS table
    console.log('1️⃣  VENDORS table columns:\n');
    const vendorsResult = await conn.execute(`
      SELECT column_name, data_type
      FROM all_tab_columns@MERCH_REMOTE
      WHERE owner = 'MERCH' AND table_name = 'VENDORS'
      ORDER BY column_id
    `);
    
    if (vendorsResult.rows.length > 0) {
      console.log(`   Found ${vendorsResult.rows.length} columns:`);
      vendorsResult.rows.slice(0, 20).forEach((row, idx) => {
        console.log(`     ${(idx + 1).toString().padStart(2, ' ')}. ${row.COLUMN_NAME.padEnd(35, ' ')} ${row.DATA_TYPE}`);
      });
      if (vendorsResult.rows.length > 20) {
        console.log(`     ... and ${vendorsResult.rows.length - 20} more columns`);
      }
    }
    
    // 2. Check STYLE_VENDORS table
    console.log('\n\n2️⃣  STYLE_VENDORS table columns:\n');
    const styleVendorsResult = await conn.execute(`
      SELECT column_name, data_type
      FROM all_tab_columns@MERCH_REMOTE
      WHERE owner = 'MERCH' AND table_name = 'STYLE_VENDORS'
      ORDER BY column_id
    `);
    
    if (styleVendorsResult.rows.length > 0) {
      console.log(`   Found ${styleVendorsResult.rows.length} columns:`);
      styleVendorsResult.rows.forEach((row, idx) => {
        console.log(`     ${(idx + 1).toString().padStart(2, ' ')}. ${row.COLUMN_NAME.padEnd(35, ' ')} ${row.DATA_TYPE}`);
      });
    } else {
      console.log('   ❌ STYLE_VENDORS table not found');
    }
    
    // 3. Check for any tables with "VENDOR" in the name
    console.log('\n\n3️⃣  All tables with VENDOR in name:\n');
    const vendorTablesResult = await conn.execute(`
      SELECT table_name
      FROM all_tables@MERCH_REMOTE
      WHERE owner = 'MERCH' AND table_name LIKE '%VENDOR%'
      ORDER BY table_name
    `);
    
    if (vendorTablesResult.rows.length > 0) {
      console.log(`   Found ${vendorTablesResult.rows.length} tables:`);
      vendorTablesResult.rows.forEach((row, idx) => {
        console.log(`     ${(idx + 1).toString().padStart(2, ' ')}. ${row.TABLE_NAME}`);
      });
    }
    
    // 4. Check for attribute-related tables
    console.log('\n\n4️⃣  Tables with ATTRIBUTE or CHARACTERISTIC in name:\n');
    const attrTablesResult = await conn.execute(`
      SELECT table_name
      FROM all_tables@MERCH_REMOTE
      WHERE owner = 'MERCH' 
        AND (table_name LIKE '%ATTRIBUTE%' OR table_name LIKE '%CHARACTERISTIC%' OR table_name LIKE '%CHAR%')
      ORDER BY table_name
    `);
    
    if (attrTablesResult.rows.length > 0) {
      console.log(`   Found ${attrTablesResult.rows.length} tables:`);
      attrTablesResult.rows.forEach((row, idx) => {
        console.log(`     ${(idx + 1).toString().padStart(2, ' ')}. ${row.TABLE_NAME}`);
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

exploreVendorDataStructure().catch(console.error);

