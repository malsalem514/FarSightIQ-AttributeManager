#!/usr/bin/env node
import oracledb from 'oracledb';

const connection = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1'
};

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function test() {
  let conn;
  
  try {
    conn = await oracledb.getConnection(connection);
    
    console.log('Testing query with:');
    console.log('  BU: 65');
    console.log('  Dept: NULL');
    console.log('  Class: 10');
    console.log('  Subclass: 100\n');

    const result = await conn.execute(`
      SELECT DISTINCT
        GROUP_ID, MANDATORY, DEPARTMENT_ID, CLASS_ID, SUBCLASS_ID
      FROM ATTR_MGR.CHARACTERISTIC_HIERARCHY_RULES
      WHERE BUSINESS_UNIT_ID = :businessUnitId
        AND ACTIVE = 'Y'
        AND GROUP_ID IS NOT NULL
        AND (
          (NVL(DEPARTMENT_ID, 'X') = NVL(:deptId, 'X') 
           AND CLASS_ID = :classId 
           AND SUBCLASS_ID = :subclassId)
          OR
          (NVL(DEPARTMENT_ID, 'X') = NVL(:deptId, 'X') 
           AND CLASS_ID = :classId 
           AND SUBCLASS_ID IS NULL)
          OR
          (NVL(DEPARTMENT_ID, 'X') = NVL(:deptId, 'X') 
           AND CLASS_ID IS NULL 
           AND SUBCLASS_ID IS NULL)
        )
    `, {
      businessUnitId: 65,
      deptId: null,
      classId: '10',
      subclassId: '100'
    });
    
    console.log(`Found ${result.rows.length} rules:\n`);
    result.rows.forEach(row => {
      console.log(row);
    });

  } finally {
    if (conn) await conn.close();
  }
}

test();

