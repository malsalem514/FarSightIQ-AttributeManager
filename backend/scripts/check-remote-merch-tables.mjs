/**
 * Check what hierarchy tables exist in remote MERCH database
 */

import oracledb from 'oracledb';

const config = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1'
};

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

console.log('\n📦 Checking Remote MERCH Database (via MERCH_REMOTE DB link)\n');
console.log('='.repeat(80));

try {
  const conn = await oracledb.getConnection(config);
  
  // Check for exact table names
  console.log('\n1️⃣  Looking for GROUPS, SUBCLASSES tables...\n');
  const exactTables = await conn.execute(
    `SELECT table_name 
     FROM all_tables@MERCH_REMOTE 
     WHERE owner = 'MERCH' 
       AND table_name IN ('GROUPS', 'SUBCLASSES', 'GROUP_CLASS', 'SUBCLASS')
     ORDER BY table_name`
  );
  
  if (exactTables.rows.length > 0) {
    console.log('✅ Found:');
    console.table(exactTables.rows);
  } else {
    console.log('❌ NOT FOUND: GROUPS, SUBCLASSES, GROUP_CLASS, SUBCLASS');
  }
  
  // Check for tables with GROUP/CLASS/DEPT in name
  console.log('\n2️⃣  Searching for tables with GROUP/CLASS/DEPT/HIER in name...\n');
  const relatedTables = await conn.execute(
    `SELECT table_name, num_rows
     FROM all_tables@MERCH_REMOTE 
     WHERE owner = 'MERCH' 
       AND (table_name LIKE '%GROUP%' 
            OR table_name LIKE '%CLASS%' 
            OR table_name LIKE '%DEPT%'
            OR table_name LIKE '%HIER%')
       AND ROWNUM <= 30
     ORDER BY table_name`
  );
  
  if (relatedTables.rows.length > 0) {
    console.log(`Found ${relatedTables.rows.length} related tables:`);
    console.table(relatedTables.rows);
  } else {
    console.log('❌ No hierarchy-related tables found');
  }
  
  // Check existing synonyms that work
  console.log('\n3️⃣  Checking existing synonyms (CLASSES, DEPARTMENTS)...\n');
  
  try {
    const classesTest = await conn.execute(
      `SELECT COUNT(*) as cnt FROM CLASSES WHERE ROWNUM <= 1`
    );
    console.log('✅ CLASSES synonym works (row count sample:', classesTest.rows[0].CNT + ')');
    
    const deptTest = await conn.execute(
      `SELECT COUNT(*) as cnt FROM DEPARTMENTS WHERE ROWNUM <= 1`
    );
    console.log('✅ DEPARTMENTS synonym works (row count sample:', deptTest.rows[0].CNT + ')');
  } catch (e) {
    console.log('❌ Synonym test failed:', e.message);
  }
  
  await conn.close();
  
  console.log('\n' + '='.repeat(80));
  console.log('\n💡 CONCLUSION:\n');
  console.log('If GROUPS and SUBCLASSES tables don\'t exist in remote MERCH,');
  console.log('then V011\'s load_hierarchy_cache procedure needs to be updated');
  console.log('to use the actual table names from the client\'s MERCH schema.\n');
  console.log('='.repeat(80) + '\n');
  
} catch (error) {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
}

