/**
 * Explore JDS client database
 * Connection: jds25qacmcs12@jds25qa
 * Compare structure with our Attribute Manager system
 */

import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// Initialize Oracle Thick mode for older database compatibility
try {
  oracledb.initOracleClient();
  console.log('✅ Oracle Thick mode initialized\n');
} catch (err) {
  console.log('⚠️  Thick mode init failed, trying with default paths:', err.message);
}

async function exploreJDSDatabase() {
  let conn;
  try {
    // Parse connection string: user@host/service
    const connString = 'merch/jds25qacmcs12@JDS25QA (100.90.37.11:1521)';
    console.log(`🔍 Connecting to JDS database: ${connString}\n`);
    console.log('='.repeat(80));
    
    // Connection: merch/jds25qacmcs12@JDS25QA
    // JDS25QA = (DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=100.90.37.11)(PORT=1521))(CONNECT_DATA=(SERVER=DEDICATED)(SERVICE_NAME=JDS25QA)))
    const connectionConfigs = [
      { 
        user: 'merch', 
        password: 'jds25qacmcs12', 
        connectString: '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=100.90.37.11)(PORT=1521))(CONNECT_DATA=(SERVER=DEDICATED)(SERVICE_NAME=JDS25QA)))' 
      },
      { 
        user: 'merch', 
        password: 'jds25qacmcs12', 
        connectString: '100.90.37.11:1521/JDS25QA' 
      }
    ];
    
    let lastError;
    for (let i = 0; i < connectionConfigs.length; i++) {
      try {
        console.log(`   Attempt ${i + 1}: Trying connectString="${connectionConfigs[i].connectString}"...`);
        conn = await oracledb.getConnection({
          ...connectionConfigs[i],
          connectionTimeout: 10000
        });
        console.log(`   ✅ Connected successfully with format ${i + 1}!`);
        break;
      } catch (err) {
        lastError = err;
        console.log(`   ❌ Failed: ${err.message.split('\n')[0]}`);
        if (i < connectionConfigs.length - 1) {
          console.log('');
        }
      }
    }
    
    if (!conn) {
      throw lastError;
    }

    console.log('\n✅ Connected to JDS database successfully!\n');
    
    // 1. Check for STYLES table
    console.log('1️⃣  STYLES Table Structure:\n');
    const stylesColsResult = await conn.execute(`
      SELECT column_name, data_type, nullable
      FROM user_tab_columns
      WHERE table_name = 'STYLES'
      ORDER BY column_id
    `);
    
    if (stylesColsResult.rows.length > 0) {
      console.log(`   ✅ STYLES table exists (${stylesColsResult.rows.length} columns)\n`);
      
      // Check for key columns
      const keyColumns = ['STYLE_ID', 'COLOR_ID', 'VENDOR_ID', 'VENDOR_STYLE_NO', 
                          'VENDOR_COMPOSITION', 'VENDOR_CARE', 'VENDOR_ORIGIN',
                          'COUNTRY_OF_ORIGIN_ID', 'DEPARTMENT_ID1', 'CLASS_ID1', 'SUB_CLASS_ID1'];
      
      console.log('   Key columns check:');
      keyColumns.forEach(col => {
        const found = stylesColsResult.rows.find(r => r.COLUMN_NAME === col);
        if (found) {
          console.log(`     ✅ ${col.padEnd(25, ' ')} ${found.DATA_TYPE.padEnd(15, ' ')} ${found.NULLABLE === 'N' ? 'NOT NULL' : 'NULLABLE'}`);
        } else {
          console.log(`     ❌ ${col.padEnd(25, ' ')} NOT FOUND`);
        }
      });
      
      // Show all vendor-related columns
      console.log('\n   All VENDOR_* columns:');
      const vendorCols = stylesColsResult.rows.filter(r => r.COLUMN_NAME.startsWith('VENDOR'));
      if (vendorCols.length > 0) {
        vendorCols.forEach(col => {
          console.log(`     - ${col.COLUMN_NAME.padEnd(30, ' ')} ${col.DATA_TYPE.padEnd(15, ' ')} ${col.NULLABLE === 'N' ? 'NOT NULL' : 'NULLABLE'}`);
        });
      } else {
        console.log('     (None found)');
      }
    } else {
      console.log('   ❌ STYLES table not found');
    }
    
    // 2. Check for STYLE_CHARACTERISTICS table
    console.log('\n\n2️⃣  STYLE_CHARACTERISTICS Table:\n');
    const styleCharResult = await conn.execute(`
      SELECT column_name, data_type, nullable
      FROM user_tab_columns
      WHERE table_name = 'STYLE_CHARACTERISTICS'
      ORDER BY column_id
    `);
    
    if (styleCharResult.rows.length > 0) {
      console.log(`   ✅ STYLE_CHARACTERISTICS exists (${styleCharResult.rows.length} columns):\n`);
      styleCharResult.rows.forEach((row, idx) => {
        console.log(`     ${(idx + 1).toString().padStart(2, ' ')}. ${row.COLUMN_NAME.padEnd(30, ' ')} ${row.DATA_TYPE.padEnd(15, ' ')} ${row.NULLABLE === 'N' ? 'NOT NULL' : 'NULLABLE'}`);
      });
      
      // Check for COLOR_ID
      const hasColorId = styleCharResult.rows.find(r => r.COLUMN_NAME === 'COLOR_ID');
      console.log(`\n   COLOR_ID column: ${hasColorId ? '✅ EXISTS' : '❌ NOT FOUND'}`);
      
      // Sample data
      console.log('\n   Sample data (first 3 rows):');
      const sampleResult = await conn.execute(`
        SELECT *
        FROM STYLE_CHARACTERISTICS
        WHERE ROWNUM <= 3
      `);
      
      if (sampleResult.rows.length > 0) {
        console.log(`     Found ${sampleResult.rows.length} rows:`);
        sampleResult.rows.forEach((row, idx) => {
          console.log(`\n     Row ${idx + 1}:`);
          Object.keys(row).slice(0, 10).forEach(key => {
            console.log(`       ${key}: ${row[key]}`);
          });
        });
      } else {
        console.log('     ℹ️  Table is empty');
      }
    } else {
      console.log('   ❌ STYLE_CHARACTERISTICS table not found');
    }
    
    // 3. Check for CHARACTERISTIC_TYPES table
    console.log('\n\n3️⃣  CHARACTERISTIC_TYPES Table:\n');
    const charTypesResult = await conn.execute(`
      SELECT column_name, data_type
      FROM user_tab_columns
      WHERE table_name = 'CHARACTERISTIC_TYPES'
      ORDER BY column_id
    `);
    
    if (charTypesResult.rows.length > 0) {
      console.log(`   ✅ CHARACTERISTIC_TYPES exists (${charTypesResult.rows.length} columns)`);
      
      // Count rows
      const countResult = await conn.execute(`
        SELECT COUNT(*) as row_count FROM CHARACTERISTIC_TYPES
      `);
      console.log(`   📊 Total characteristic types: ${countResult.rows[0].ROW_COUNT}`);
      
      // Sample types
      const sampleTypes = await conn.execute(`
        SELECT characteristic_type_id, description
        FROM CHARACTERISTIC_TYPES
        WHERE ROWNUM <= 10
      `);
      
      if (sampleTypes.rows.length > 0) {
        console.log('\n   Sample characteristic types:');
        sampleTypes.rows.forEach((row, idx) => {
          console.log(`     ${(idx + 1).toString().padStart(2, ' ')}. ${row.CHARACTERISTIC_TYPE_ID.padEnd(20, ' ')} - ${row.DESCRIPTION}`);
        });
      }
    } else {
      console.log('   ❌ CHARACTERISTIC_TYPES table not found');
    }
    
    // 4. Check for CHARACTERISTIC_VALUES table
    console.log('\n\n4️⃣  CHARACTERISTIC_VALUES Table:\n');
    const charValuesResult = await conn.execute(`
      SELECT column_name, data_type
      FROM user_tab_columns
      WHERE table_name = 'CHARACTERISTIC_VALUES'
      ORDER BY column_id
    `);
    
    if (charValuesResult.rows.length > 0) {
      console.log(`   ✅ CHARACTERISTIC_VALUES exists (${charValuesResult.rows.length} columns)`);
      
      // Count rows
      const countResult = await conn.execute(`
        SELECT COUNT(*) as row_count FROM CHARACTERISTIC_VALUES
      `);
      console.log(`   📊 Total characteristic values: ${countResult.rows[0].ROW_COUNT}`);
    } else {
      console.log('   ❌ CHARACTERISTIC_VALUES table not found');
    }
    
    // 5. Check for our custom tables
    console.log('\n\n5️⃣  Our Custom Attribute Manager Tables:\n');
    const customTables = [
      'ATTRIBUTE_GROUPS',
      'CHARACTERISTIC_HIERARCHY_RULES',
      'LLM_CHAR_MAPPINGS',
      'AI_ATTRIBUTION_RESULTS',
      'ATTR_MANAGER_CACHE'
    ];
    
    for (const tableName of customTables) {
      const checkResult = await conn.execute(`
        SELECT COUNT(*) as exists_flag
        FROM user_tables
        WHERE table_name = :tableName
      `, { tableName });
      
      const exists = checkResult.rows[0].EXISTS_FLAG > 0;
      console.log(`   ${exists ? '✅' : '❌'} ${tableName}`);
      
      if (exists) {
        const countResult = await conn.execute(`
          SELECT COUNT(*) as row_count FROM ${tableName}
        `);
        console.log(`      📊 Rows: ${countResult.rows[0].ROW_COUNT}`);
      }
    }
    
    // 6. Check for VENDOR_CHARACTERISTICS
    console.log('\n\n6️⃣  VENDOR_CHARACTERISTICS Table:\n');
    const vendorCharResult = await conn.execute(`
      SELECT column_name, data_type
      FROM user_tab_columns
      WHERE table_name = 'VENDOR_CHARACTERISTICS'
      ORDER BY column_id
    `);
    
    if (vendorCharResult.rows.length > 0) {
      console.log(`   ✅ VENDOR_CHARACTERISTICS exists (${vendorCharResult.rows.length} columns)`);
      vendorCharResult.rows.forEach((row, idx) => {
        console.log(`     ${(idx + 1).toString().padStart(2, ' ')}. ${row.COLUMN_NAME.padEnd(30, ' ')} ${row.DATA_TYPE}`);
      });
      
      const countResult = await conn.execute(`
        SELECT COUNT(*) as row_count FROM VENDOR_CHARACTERISTICS
      `);
      console.log(`\n   📊 Total rows: ${countResult.rows[0].ROW_COUNT}`);
    } else {
      console.log('   ❌ VENDOR_CHARACTERISTICS table not found');
    }
    
    // 7. Summary
    console.log('\n\n' + '='.repeat(80));
    console.log('\n📋 VALIDATION SUMMARY:\n');
    
    const hasStyles = stylesColsResult.rows.length > 0;
    const hasStyleChar = styleCharResult.rows.length > 0;
    const hasCharTypes = charTypesResult.rows.length > 0;
    const hasCharValues = charValuesResult.rows.length > 0;
    
    console.log(`   Core Tables:          ${hasStyles && hasStyleChar && hasCharTypes && hasCharValues ? '✅ ALL PRESENT' : '⚠️  SOME MISSING'}`);
    console.log(`   STYLES table:         ${hasStyles ? '✅' : '❌'}`);
    console.log(`   STYLE_CHARACTERISTICS: ${hasStyleChar ? '✅' : '❌'}`);
    console.log(`   CHARACTERISTIC_TYPES:  ${hasCharTypes ? '✅' : '❌'}`);
    console.log(`   CHARACTERISTIC_VALUES: ${hasCharValues ? '✅' : '❌'}`);
    
    if (stylesColsResult.rows.length > 0) {
      const hasVendorComp = stylesColsResult.rows.find(r => r.COLUMN_NAME === 'VENDOR_COMPOSITION');
      const hasVendorCare = stylesColsResult.rows.find(r => r.COLUMN_NAME === 'VENDOR_CARE');
      const hasVendorOrigin = stylesColsResult.rows.find(r => r.COLUMN_NAME === 'VENDOR_ORIGIN');
      const hasColorId = stylesColsResult.rows.find(r => r.COLUMN_NAME === 'COLOR_ID');
      
      console.log(`\n   STYLES Schema Differences:`);
      console.log(`   - COLOR_ID column:        ${hasColorId ? '✅ HAS IT' : '❌ MISSING (style-level only)'}`);
      console.log(`   - VENDOR_COMPOSITION:     ${hasVendorComp ? '✅ HAS IT' : '❌ MISSING'}`);
      console.log(`   - VENDOR_CARE:            ${hasVendorCare ? '✅ HAS IT' : '❌ MISSING'}`);
      console.log(`   - VENDOR_ORIGIN:          ${hasVendorOrigin ? '✅ HAS IT' : '❌ MISSING'}`);
    }
    
    if (styleCharResult.rows.length > 0) {
      const hasColorIdInChar = styleCharResult.rows.find(r => r.COLUMN_NAME === 'COLOR_ID');
      console.log(`\n   STYLE_CHARACTERISTICS:`);
      console.log(`   - COLOR_ID column:        ${hasColorIdInChar ? '✅ HAS IT (style-color level)' : '❌ MISSING (style-level only)'}`);
    }
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('ORA-01017')) {
      console.log('\n💡 Tip: Try different password or check connection string format');
      console.log('   Format: user/password@host:port/service');
    }
    
    throw error;
  } finally {
    if (conn) {
      try {
        await conn.close();
        console.log('\n✅ Connection closed');
      } catch (err) {
        console.error('Error closing connection:', err.message);
      }
    }
  }
}

exploreJDSDatabase().catch(console.error);

