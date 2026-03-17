/**
 * Diagnose hierarchy service issue
 */
import oracledb from 'oracledb';

const config = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1',
};

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const conn = await oracledb.getConnection(config);

console.log('\n🔍 DIAGNOSING HIERARCHY SERVICE\n');
console.log('='.repeat(80));

// Step 1: Check validity
console.log('\n1️⃣ Testing is_hierarchy_cache_valid...\n');
const validResult = await conn.execute(
  `SELECT ATTR_MANAGER_PKG.is_hierarchy_cache_valid(88, 3600) AS is_valid FROM DUAL`
);
console.log('   Result:', validResult.rows[0]);

// Step 2: Get hierarchy cache (same as service does)
console.log('\n2️⃣ Testing get_hierarchy_cache (same as Node.js service)...\n');
const cacheResult = await conn.execute(
  `BEGIN
     ATTR_MANAGER_PKG.get_hierarchy_cache(
       p_business_unit_id => :buId,
       p_ttl_seconds => :ttl,
       p_result => :cursor
     );
   END;`,
  {
    buId: 88,
    ttl: 3600,
    cursor: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
  }
);

const resultSet = cacheResult.outBinds.cursor;
const rows = await resultSet.getRows(10000); // Same as service
await resultSet.close();

console.log('   Rows fetched:', rows.length);
console.log('   First row:', JSON.stringify(rows[0], null, 2));

if (rows.length > 0) {
  console.log('\n3️⃣ Checking row structure...\n');
  console.log('   Row keys:', Object.keys(rows[0]));
  console.log('   STATUS value:', rows[0].STATUS);
  console.log('   STATUS === "CACHE_EXPIRED_OR_MISSING"?', rows[0].STATUS === 'CACHE_EXPIRED_OR_MISSING');
  console.log('   rows.length === 0?', rows.length === 0);
  console.log('   Should skip rows?', rows.length === 0 || rows[0].STATUS === 'CACHE_EXPIRED_OR_MISSING');
  
  console.log('\n4️⃣ Testing formatHierarchy logic...\n');
  const hierarchy = {
    groups: {},
    departments: {},
    classes: {},
    subclasses: {},
  };
  
  for (const row of rows) {
    if (row.GRP_ID && row.GRP_DESCR && row.GRP_ID !== 'N/A' && !hierarchy.groups[row.GRP_ID]) {
      hierarchy.groups[row.GRP_ID] = row.GRP_DESCR;
    }
    if (row.DEPT_ID && row.DEPT_NAME && !hierarchy.departments[row.DEPT_ID]) {
      hierarchy.departments[row.DEPT_ID] = row.DEPT_NAME;
    }
    if (row.CLASS_ID && row.CLASS_DESCR && !hierarchy.classes[row.CLASS_ID]) {
      hierarchy.classes[row.CLASS_ID] = row.CLASS_DESCR;
    }
    if (row.SUBCLASS_ID && row.SUBCLASS_DESCR && !hierarchy.subclasses[row.SUBCLASS_ID]) {
      hierarchy.subclasses[row.SUBCLASS_ID] = row.SUBCLASS_DESCR;
    }
  }
  
  console.log('   Formatted hierarchy:');
  console.log('   - Groups:', Object.keys(hierarchy.groups).length);
  console.log('   - Departments:', Object.keys(hierarchy.departments).length);
  console.log('   - Classes:', Object.keys(hierarchy.classes).length);
  console.log('   - Subclasses:', Object.keys(hierarchy.subclasses).length);
  
  if (Object.keys(hierarchy.departments).length === 0) {
    console.log('\n❌ PROBLEM: formatHierarchy returns empty despite having', rows.length, 'rows!');
    console.log('   Sample row for inspection:');
    console.log('   - DEPT_ID:', rows[0].DEPT_ID, '(type:', typeof rows[0].DEPT_ID, ')');
    console.log('   - DEPT_NAME:', rows[0].DEPT_NAME, '(type:', typeof rows[0].DEPT_NAME, ')');
    console.log('   - Truthy check: DEPT_ID &&', !!rows[0].DEPT_ID, 'DEPT_NAME &&', !!rows[0].DEPT_NAME);
    console.log('   - Already exists?', !!hierarchy.departments[rows[0].DEPT_ID]);
  } else {
    console.log('\n✅ formatHierarchy works correctly!');
  }
}

await conn.close();

console.log('\n' + '='.repeat(80) + '\n');

