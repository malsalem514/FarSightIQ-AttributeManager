/**
 * Check Review Grid Data Availability
 */

import oracledb from 'oracledb';

const config = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1',
  connectionClass: 'attr_manager'
};

try {
  // Enable thick client mode
  oracledb.initOracleClient();
} catch (err) {
  console.log('Oracle client already initialized or not needed');
}

async function checkData() {
  let conn;
  
  try {
    console.log('\n=== Checking Review Grid Data ===\n');
    
    conn = await oracledb.getConnection(config);
    
    // 0. Get column names
    console.log('0. Getting STYLES table structure...');
    const sample = await conn.execute(
      `SELECT * FROM STYLES WHERE ROWNUM <= 1`
    );
    console.log(`   Columns: ${sample.metaData.map(c => c.name).join(', ')}`);
    
    // 1. Check if STYLES table is accessible
    console.log('\n1. Testing STYLES table access...');
    const stylesCheck = await conn.execute(
      `SELECT COUNT(*) AS CNT FROM STYLES WHERE BUSINESS_UNIT_ID = 1`
    );
    console.log(`   ✓ Total styles for BU=1: ${stylesCheck.rows[0][0]}`);
    
    // 2. Check departments in STYLES
    console.log('\n2. Checking departments in STYLES...');
    const depts = await conn.execute(
      `SELECT DISTINCT DEPARTMENT_ID1, COUNT(*) AS CNT 
       FROM STYLES 
       WHERE BUSINESS_UNIT_ID = 1 
       GROUP BY DEPARTMENT_ID1 
       ORDER BY DEPARTMENT_ID1`
    );
    console.log(`   Found ${depts.rows.length} departments:`);
    depts.rows.forEach(row => {
      console.log(`     - ${row[0]}: ${row[1]} styles`);
    });
    
    // 3. Test the review grid query for first department
    if (depts.rows.length > 0) {
      const testDept = depts.rows[0][0];
      console.log(`\n3. Testing review grid query for ${testDept}...`);
      
      // Count query
      const countResult = await conn.execute(
        `SELECT COUNT(*) AS TOTAL FROM STYLES s WHERE s.BUSINESS_UNIT_ID = :buId AND s.DEPARTMENT_ID1 = :deptId`,
        { buId: 1, deptId: testDept }
      );
      console.log(`   Count query result: ${countResult.rows[0][0]}`);
      
      // Actual query
      const productsResult = await conn.execute(
        `SELECT 
          s.STYLE_ID,
          s.DESCRIPTION AS LONG_STYLE_DESC,
          s.DESCRIPTION AS SHORT_STYLE_DESC,
          s.DEPARTMENT_ID1 AS DEPT_ID,
          s.CLASS_ID1 AS CLASS_ID,
          s.SUB_CLASS_ID1 AS SUB_CLASS_ID,
          (SELECT COUNT(*) FROM STYLE_CHARACTERISTICS sc 
           WHERE sc.BUSINESS_UNIT_ID = s.BUSINESS_UNIT_ID 
           AND sc.STYLE_ID = s.STYLE_ID) AS ATTR_COUNT
        FROM STYLES s
        WHERE s.BUSINESS_UNIT_ID = :buId AND s.DEPARTMENT_ID1 = :deptId
        ORDER BY s.STYLE_ID
        OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY`,
        { buId: 1, deptId: testDept },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      console.log(`   Products query returned: ${productsResult.rows.length} rows`);
      if (productsResult.rows.length > 0) {
        console.log(`   Sample product:`, JSON.stringify(productsResult.rows[0], null, 2));
      }
    }
    
    console.log('\n✅ Data check complete\n');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('   Stack:', err.stack);
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
}

checkData().then(() => process.exit(0)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

