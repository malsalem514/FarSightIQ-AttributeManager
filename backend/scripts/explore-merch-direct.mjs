/**
 * Explore MERCH database directly (not via remote link)
 * Connection: merch/merch@nrf-oci-db-01/demodb
 */

import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function exploreMerchDirect() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: 'merch',
      password: 'merch',
      connectString: 'nrf-oci-db-01/demodb',
      connectionTimeout: 10000
    });

    console.log('✅ Connected to MERCH database directly!\n');
    console.log('='.repeat(80));
    
    // 1. Check STYLES table structure
    console.log('\n1️⃣  STYLES table - checking for vendor columns:\n');
    const stylesResult = await conn.execute(`
      SELECT column_name, data_type
      FROM user_tab_columns
      WHERE table_name = 'STYLES'
        AND (column_name LIKE 'VENDOR%' 
          OR column_name LIKE '%COMPOSITION%' 
          OR column_name LIKE '%CARE%' 
          OR column_name LIKE '%ORIGIN%')
      ORDER BY column_name
    `);
    
    if (stylesResult.rows.length > 0) {
      console.log('   Vendor-related columns found:');
      stylesResult.rows.forEach((row) => {
        console.log(`     - ${row.COLUMN_NAME.padEnd(35, ' ')} ${row.DATA_TYPE}`);
      });
    } else {
      console.log('   ❌ No vendor attribute columns in STYLES table');
    }
    
    // 2. Check VENDOR_CHARACTERISTICS
    console.log('\n\n2️⃣  VENDOR_CHARACTERISTICS table structure:\n');
    const vendorCharResult = await conn.execute(`
      SELECT column_name, data_type
      FROM user_tab_columns
      WHERE table_name = 'VENDOR_CHARACTERISTICS'
      ORDER BY column_id
    `);
    
    if (vendorCharResult.rows.length > 0) {
      console.log(`   Found ${vendorCharResult.rows.length} columns:`);
      vendorCharResult.rows.forEach((row, idx) => {
        console.log(`     ${(idx + 1).toString().padStart(2, ' ')}. ${row.COLUMN_NAME.padEnd(35, ' ')} ${row.DATA_TYPE}`);
      });
      
      // Sample data
      console.log('\n   Sample data (first 3 rows):');
      const sampleResult = await conn.execute(`
        SELECT *
        FROM VENDOR_CHARACTERISTICS
        WHERE ROWNUM <= 3
      `);
      
      if (sampleResult.rows.length > 0) {
        sampleResult.rows.forEach((row, idx) => {
          console.log(`\n   Row ${idx + 1}:`);
          Object.keys(row).forEach(key => {
            console.log(`     ${key}: ${row[key]}`);
          });
        });
      } else {
        console.log('     ℹ️  Table is empty');
      }
    } else {
      console.log('   ❌ VENDOR_CHARACTERISTICS table not found');
    }
    
    // 3. Check STYLE_CHARACTERISTICS
    console.log('\n\n3️⃣  STYLE_CHARACTERISTICS table structure:\n');
    const styleCharResult = await conn.execute(`
      SELECT column_name, data_type
      FROM user_tab_columns
      WHERE table_name = 'STYLE_CHARACTERISTICS'
      ORDER BY column_id
    `);
    
    if (styleCharResult.rows.length > 0) {
      console.log(`   Found ${styleCharResult.rows.length} columns:`);
      styleCharResult.rows.forEach((row, idx) => {
        console.log(`     ${(idx + 1).toString().padStart(2, ' ')}. ${row.COLUMN_NAME.padEnd(35, ' ')} ${row.DATA_TYPE}`);
      });
      
      // Sample data
      console.log('\n   Sample data for style_id = 50229 (first 5 rows):');
      const sampleResult = await conn.execute(`
        SELECT sc.*, ct.description as type_desc, cv.description as value_desc
        FROM STYLE_CHARACTERISTICS sc
        LEFT JOIN CHARACTERISTIC_TYPES ct 
          ON sc.characteristic_type_id = ct.characteristic_type_id
          AND sc.business_unit_id = ct.business_unit_id
        LEFT JOIN CHARACTERISTIC_VALUES cv
          ON sc.characteristic_type_id = cv.characteristic_type_id
          AND sc.characteristic_value_id = cv.characteristic_value_id
          AND sc.business_unit_id = cv.business_unit_id
        WHERE sc.style_id = '50229'
          AND ROWNUM <= 5
      `);
      
      if (sampleResult.rows.length > 0) {
        sampleResult.rows.forEach((row, idx) => {
          console.log(`\n   Attribute ${idx + 1}:`);
          console.log(`     Type: ${row.CHARACTERISTIC_TYPE_ID} (${row.TYPE_DESC})`);
          console.log(`     Value: ${row.CHARACTERISTIC_VALUE_ID} (${row.VALUE_DESC})`);
        });
      } else {
        console.log('     ℹ️  No characteristics found for style_id 50229');
      }
    } else {
      console.log('   ❌ STYLE_CHARACTERISTICS table not found');
    }
    
    console.log('\n' + '='.repeat(80));
    
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

exploreMerchDirect().catch(console.error);

