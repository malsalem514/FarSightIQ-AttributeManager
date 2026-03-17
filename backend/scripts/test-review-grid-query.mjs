import oracledb from 'oracledb';

const config = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1'
};

try {
  oracledb.initOracleClient();
} catch (e) {}

async function test() {
  let conn;
  try {
    conn = await oracledb.getConnection(config);
    
    const businessUnitId = 1;
    const departmentId = 'CHAP';
    const page = 1;
    const pageSize = 5;
    
    const whereClauses = [`s.BUSINESS_UNIT_ID = :buId`, `s.DEPARTMENT_ID1 = :deptId`];
    const bindParams = { buId: businessUnitId, deptId: departmentId };
    const whereClause = whereClauses.join(' AND ');
    const offset = (page - 1) * pageSize;
    
    // Test count query
    console.log('\n=== Count Query ===');
    const countResult = await conn.execute(
      `SELECT COUNT(*) AS TOTAL FROM STYLES s WHERE ${whereClause}`,
      bindParams,
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('Count result:', countResult.rows);
    console.log('Total items:', countResult.rows?.[0]?.TOTAL);
    
    // Test products query
    console.log('\n=== Products Query ===');
    const result = await conn.execute(
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
      WHERE ${whereClause}
      ORDER BY s.STYLE_ID
      OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
      { ...bindParams, offset, pageSize },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    console.log('Products result:', result.rows);
    console.log('Number of products:', result.rows?.length);
    
    if (result.rows && result.rows.length > 0) {
      console.log('\nSample product:', JSON.stringify(result.rows[0], null, 2));
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (conn) await conn.close();
  }
}

test();

