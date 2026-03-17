#!/usr/bin/env node
/**
 * Query MERCH Database for Sample Data
 * 
 * Connects via local attr_mgr with MERCH_REMOTE DB link
 * Finds sample hierarchy and attribute data
 */

import oracledb from 'oracledb';

const connection = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1'
};

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function query() {
  let conn;
  
  try {
    console.log('🔌 Connecting to MERCH database...');
    conn = await oracledb.getConnection(connection);
    console.log('✅ Connected!\n');

    // Query 1: Check STYLES table columns first
    console.log('='.repeat(80));
    console.log('🔍 STYLES TABLE COLUMNS');
    console.log('='.repeat(80));
    
    const columns = await conn.execute(`
      SELECT column_name, data_type
      FROM all_tab_columns@MERCH_REMOTE
      WHERE owner = 'MERCH'
        AND table_name = 'STYLES'
      ORDER BY column_id
    `);
    
    console.log(`Found ${columns.rows.length} columns:\n`);
    
    // Show hierarchy-related columns
    const hierColumns = columns.rows.filter(r => 
      r.COLUMN_NAME.includes('DEPT') || 
      r.COLUMN_NAME.includes('CLASS') || 
      r.COLUMN_NAME.includes('SUBCLASS') ||
      r.COLUMN_NAME.includes('GROUP')
    );
    console.log('Hierarchy-related columns:');
    hierColumns.forEach(row => {
      console.log(`  ${row.COLUMN_NAME}: ${row.DATA_TYPE}`);
    });
    
    console.log('\nAll columns (first 30):');
    columns.rows.slice(0, 30).forEach(row => {
      console.log(`  ${row.COLUMN_NAME}: ${row.DATA_TYPE}`);
    });
    
    // Query 2: Sample Products with Hierarchy
    console.log('\n' + '='.repeat(80));
    console.log('📦 SAMPLE PRODUCTS (with hierarchy info)');
    console.log('='.repeat(80));
    
    const products = await conn.execute(`
      SELECT 
        STYLE_ID,
        DESCRIPTION,
        CLASS_ID1, CLASS_DESCR1,
        SUB_CLASS_ID1, SUB_CLASS_DESCR1,
        SECTION_ID, DEPTH
      FROM MERCH.STYLES@MERCH_REMOTE 
      WHERE BUSINESS_UNIT_ID = 65
        AND CLASS_ID1 IS NOT NULL
        AND SUB_CLASS_ID1 IS NOT NULL
        AND ROWNUM <= 10
      ORDER BY STYLE_ID
    `);
    
    console.log(`Found ${products.rows.length} products:\n`);
    products.rows.forEach(row => {
      console.log(`  Style: ${row.STYLE_ID} - ${row.DESCRIPTION}`);
      console.log(`  Hierarchy: Class=${row.CLASS_ID1} (${row.CLASS_DESCR1}) > Subclass=${row.SUB_CLASS_ID1} (${row.SUB_CLASS_DESCR1})`);
      console.log(`  Section: ${row.SECTION_ID}, Depth: ${row.DEPTH}\n`);
    });

    // Query 3: Unique Hierarchies
    console.log('='.repeat(80));
    console.log('🌳 UNIQUE HIERARCHIES (Class/Subclass combinations)');
    console.log('='.repeat(80));
    
    const hierarchies = await conn.execute(`
      SELECT DISTINCT
        CLASS_ID1, CLASS_DESCR1,
        SUB_CLASS_ID1, SUB_CLASS_DESCR1,
        COUNT(*) OVER (PARTITION BY CLASS_ID1, SUB_CLASS_ID1) as PRODUCT_COUNT
      FROM MERCH.STYLES@MERCH_REMOTE
      WHERE BUSINESS_UNIT_ID = 65
        AND CLASS_ID1 IS NOT NULL
        AND SUB_CLASS_ID1 IS NOT NULL
      ORDER BY CLASS_ID1, SUB_CLASS_ID1
      FETCH FIRST 10 ROWS ONLY
    `);
    
    console.log(`Found ${hierarchies.rows.length} unique hierarchies:\n`);
    hierarchies.rows.forEach(row => {
      console.log(`  Class: ${row.CLASS_ID1} (${row.CLASS_DESCR1})`);
      console.log(`    Subclass: ${row.SUB_CLASS_ID1} (${row.SUB_CLASS_DESCR1}) - ${row.PRODUCT_COUNT} products\n`);
    });

    // Query 4: Existing Attribute Groups (in ATTR_MGR schema if accessible)
    console.log('\n' + '='.repeat(80));
    console.log('📋 ATTRIBUTE GROUPS (if accessible)');
    console.log('='.repeat(80));
    
    try {
      const groups = await conn.execute(`
        SELECT 
          GROUP_ID, GROUP_CODE, DESCRIPTION, DISPLAY_NAME, GROUP_TYPE
        FROM ATTR_MGR.ATTRIBUTE_GROUPS
        WHERE BUSINESS_UNIT_ID = 65
          AND ACTIVE = 'Y'
        ORDER BY SORT_ORDER
      `);
      
      console.log(`Found ${groups.rows.length} attribute groups:\n`);
      groups.rows.forEach(row => {
        console.log(`  ${row.GROUP_ID} (${row.GROUP_CODE}): ${row.DISPLAY_NAME} - ${row.GROUP_TYPE}`);
      });
    } catch (err) {
      console.log('⚠️  Cannot access ATTR_MGR.ATTRIBUTE_GROUPS (may need grants)\n');
    }

    // Query 5: Characteristic Types (in MERCH schema)
    console.log('='.repeat(80));
    console.log('🏷️  CHARACTERISTIC TYPES (in MERCH schema)');
    console.log('='.repeat(80));
    
    const charTypes = await conn.execute(`
      SELECT 
        CHARACTERISTIC_TYPE_ID,
        DESCRIPTION
      FROM (
        SELECT DISTINCT 
          CHARACTERISTIC_TYPE_ID,
          DESCRIPTION
        FROM MERCH.CHARACTERISTICS@MERCH_REMOTE
        WHERE BUSINESS_UNIT_ID = 65
          AND CHARACTERISTIC_TYPE_ID IS NOT NULL
        ORDER BY CHARACTERISTIC_TYPE_ID
      )
      WHERE ROWNUM <= 20
    `);
    
    console.log(`Found ${charTypes.rows.length} characteristic types:\n`);
    charTypes.rows.forEach(row => {
      console.log(`  ${row.CHARACTERISTIC_TYPE_ID}: ${row.DESCRIPTION}`);
    });

    // Query 6: Sample Products with Characteristics
    console.log('\n' + '='.repeat(80));
    console.log('🎨 SAMPLE PRODUCT WITH CHARACTERISTICS');
    console.log('='.repeat(80));
    
    const sampleStyle = products.rows[0].STYLE_ID;
    const sampleColor = products.rows[0].COLOR_ID;
    
    const chars = await conn.execute(`
      SELECT 
        CHARACTERISTIC_TYPE_ID,
        CHARACTERISTIC_VALUE_ID,
        DESCRIPTION
      FROM MERCH.CHARACTERISTICS@MERCH_REMOTE
      WHERE BUSINESS_UNIT_ID = 65
        AND STYLE_ID = :styleId
        AND COLOR_ID = :colorId
      ORDER BY CHARACTERISTIC_TYPE_ID
    `, {
      styleId: sampleStyle,
      colorId: sampleColor
    });
    
    console.log(`Style ${sampleStyle} Color ${sampleColor} has ${chars.rows.length} characteristics:\n`);
    chars.rows.forEach(row => {
      console.log(`  ${row.CHARACTERISTIC_TYPE_ID}: ${row.CHARACTERISTIC_VALUE_ID} (${row.DESCRIPTION})`);
    });

    // Query 7: Hierarchy Descriptions
    console.log('\n' + '='.repeat(80));
    console.log('📖 HIERARCHY DESCRIPTIONS');
    console.log('='.repeat(80));
    
    try {
      const hierDesc = await conn.execute(`
        SELECT 
          DEPARTMENT_ID, CLASS_ID, SUB_CLASS_ID,
          DEPT_DESC, CLASS_DESC, SUBCLASS_DESC
        FROM MERCH.IRO_PLAN_HIERARCHY@MERCH_REMOTE
        WHERE ROWNUM <= 5
        ORDER BY DEPARTMENT_ID, CLASS_ID, SUB_CLASS_ID
      `);
      
      console.log(`Found ${hierDesc.rows.length} hierarchy descriptions:\n`);
      hierDesc.rows.forEach(row => {
        console.log(`  Dept ${row.DEPARTMENT_ID} (${row.DEPT_DESC}) > Class ${row.CLASS_ID} (${row.CLASS_DESC}) > Subclass ${row.SUB_CLASS_ID} (${row.SUBCLASS_DESC})`);
      });
    } catch (err) {
      console.log('⚠️  Cannot access IRO_PLAN_HIERARCHY\n');
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Query complete!');
    console.log('='.repeat(80));

  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    if (conn) {
      await conn.close();
    }
  }
}

query().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

