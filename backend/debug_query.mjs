import oracledb from 'oracledb';
import dotenv from 'dotenv';

dotenv.config();

async function checkFailingQuery() {
  const config = {
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  };

  let conn;
  try {
    conn = await oracledb.getConnection(config);
    const tenantId = 'HRI_MPRD'; // Based on check_envs.sql
    const buId = 1;
    const lId = '0077';
    
    console.log('Running query with:', { tenantId, buId, lId });

    const sql = `
      SELECT r.RULE_ID, r.BUSINESS_UNIT_ID, r.LEVEL_TYPE, r.LEVEL_ID, 
             r.CHARACTERISTIC_TYPE_ID, r.IS_MANDATORY, r.APPLICABILITY, r.DEFAULT_VALUE_ID,
             ct.DESCRIPTION as CHAR_NAME
      FROM ATTRIBUTE_HIERARCHY_RULES r
      LEFT JOIN CHARACTERISTIC_TYPES ct 
        ON ct.BUSINESS_UNIT_ID = r.BUSINESS_UNIT_ID 
        AND ct.CHARACTERISTIC_TYPE_ID = r.CHARACTERISTIC_TYPE_ID
      WHERE r.TENANT_ID = :tenant
        AND r.BUSINESS_UNIT_ID = :buId
        AND (
          (r.LEVEL_TYPE = 'DEPT' AND r.LEVEL_ID = :lId)
          OR (r.LEVEL_TYPE = 'CLASS' AND r.LEVEL_ID IN (
            SELECT DISTINCT CLASS_ID FROM HIERARCHY_CACHE 
            WHERE BUSINESS_UNIT_ID = :buId AND DEPT_ID = :lId
          ))
          OR (r.LEVEL_TYPE = 'SUBCLASS' AND r.LEVEL_ID IN (
            SELECT DISTINCT SUB_CLASS_ID FROM HIERARCHY_CACHE 
            WHERE BUSINESS_UNIT_ID = :buId AND DEPT_ID = :lId
          ))
        )
      ORDER BY r.LEVEL_TYPE, r.LEVEL_ID, r.IS_MANDATORY DESC, ct.DESCRIPTION
    `;

    const result = await conn.execute(sql, { tenant: tenantId, buId, lId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    console.log('Query Success. Rows found:', result.rows.length);

  } catch (err) {
    console.error('Query FAILED:', err.message);
    if (err.sql) console.log('SQL:', err.sql);
  } finally {
    if (conn) await conn.close();
  }
}

checkFailingQuery();
