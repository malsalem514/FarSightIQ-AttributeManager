/**
 * Check what schemas exist in Oracle
 */

import oracledb from 'oracledb';

// Try different connections
const connections = [
  {
    name: 'Local Docker (attr_mgr)',
    user: 'attr_mgr',
    password: 'attr_mgr_dev',
    connectString: 'localhost:1521/FREEPDB1'
  },
  {
    name: 'Local Docker (system)',
    user: 'system',
    password: 'oracle',
    connectString: 'localhost:1521/FREEPDB1'
  }
];

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function checkConnection(config) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${config.name}`);
  console.log(`User: ${config.user} @ ${config.connectString}`);
  console.log(`${'='.repeat(80)}\n`);

  let connection;
  try {
    connection = await oracledb.getConnection(config);
    console.log('✅ Connected!\n');

    // Check current user
    const currentUser = await connection.execute(`SELECT USER FROM DUAL`);
    console.log(`Current user: ${currentUser.rows[0].USER}\n`);

    // List all schemas (simplified for Oracle XE)
    console.log('📊 All Schemas:');
    const schemas = await connection.execute(`
      SELECT username, TO_CHAR(created, 'YYYY-MM-DD') as created_date
      FROM all_users 
      WHERE username NOT LIKE '%SYS%' 
        AND username NOT LIKE 'XDB'
        AND username NOT LIKE 'APEX%'
      ORDER BY username
    `);
    console.table(schemas.rows);

    // Check for ATTR_MGR schema
    const attrMgrCheck = await connection.execute(`
      SELECT COUNT(*) as cnt FROM all_users WHERE username = 'ATTR_MGR'
    `);
    
    if (attrMgrCheck.rows[0].CNT > 0) {
      console.log('\n✅ ATTR_MGR schema exists!');
      
      // List tables in ATTR_MGR
      console.log('\n📋 Tables in ATTR_MGR:');
      const tables = await connection.execute(`
        SELECT table_name, num_rows, last_analyzed 
        FROM all_tables 
        WHERE owner = 'ATTR_MGR' 
        ORDER BY table_name
      `);
      
      if (tables.rows.length > 0) {
        console.table(tables.rows);
      } else {
        console.log('  (No tables found)');
      }
      
      // List packages in ATTR_MGR
      console.log('\n📦 Packages in ATTR_MGR:');
      const packages = await connection.execute(`
        SELECT object_name, object_type, status, 
               TO_CHAR(last_ddl_time, 'YYYY-MM-DD HH24:MI:SS') as last_modified
        FROM all_objects 
        WHERE owner = 'ATTR_MGR' 
          AND object_type IN ('PACKAGE', 'PACKAGE BODY')
        ORDER BY object_name, object_type
      `);
      
      if (packages.rows.length > 0) {
        console.table(packages.rows);
      } else {
        console.log('  (No packages found)');
      }
    } else {
      console.log('\n⚠️  ATTR_MGR schema does NOT exist');
    }

    return true;
    
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    return false;
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

async function main() {
  console.log('\n🔍 Checking Oracle Schemas...\n');

  for (const config of connections) {
    const success = await checkConnection(config);
    if (success) {
      console.log('\n✅ Found a working connection!\n');
      break;
    }
  }
}

main().catch(console.error);

