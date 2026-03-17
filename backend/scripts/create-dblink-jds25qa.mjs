/**
 * Create Database Link to JDS25QA
 * 
 * Creates DB link from local attr_mgr schema to remote JDS25QA
 * Pattern: PAT-TERMINAL-EXECUTION-01 (script-based DB operations)
 */

import oracledb from 'oracledb';

// Enable Oracle Thick mode (required for JDS25QA's older password verifier)
try {
  oracledb.initOracleClient();
  console.log('✅ Oracle Thick mode enabled');
} catch (err) {
  console.log('⚠️  Oracle Thick mode already initialized or not needed');
}

const LOCAL_CONFIG = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1',
  connectionTimeoutMillis: 10000
};

const JDS25QA_CONFIG = {
  user: 'merch', // Assuming same user as other MERCH databases
  password: 'jds25qacmcs12', // Will need actual password
  connectString: '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=100.90.37.11)(PORT=1521))(CONNECT_DATA=(SERVER=DEDICATED)(SERVICE_NAME=JDS25QA)))'
};

async function createDbLink() {
  let conn;
  
  try {
    console.log('📡 Connecting to local attr_mgr schema...');
    conn = await oracledb.getConnection(LOCAL_CONFIG);
    console.log('✅ Connected to attr_mgr@localhost:1521/FREEPDB1\n');

    // Drop existing DB link if it exists
    console.log('🗑️  Dropping existing JDS25QA_LINK if exists...');
    try {
      await conn.execute(`DROP DATABASE LINK JDS25QA_LINK`);
      console.log('✅ Existing DB link dropped');
    } catch (err) {
      console.log('ℹ️  No existing DB link to drop (this is fine)');
    }

    // Create new DB link
    console.log('\n🔗 Creating DB link to JDS25QA...');
    const createDbLinkSql = `
      CREATE DATABASE LINK JDS25QA_LINK
      CONNECT TO ${JDS25QA_CONFIG.user}
      IDENTIFIED BY "${JDS25QA_CONFIG.password}"
      USING '${JDS25QA_CONFIG.connectString}'
    `;
    
    await conn.execute(createDbLinkSql);
    await conn.commit();
    console.log('✅ DB link JDS25QA_LINK created successfully\n');

    // Test the DB link
    console.log('🧪 Testing DB link with simple query...');
    const testResult = await conn.execute(
      `SELECT COUNT(*) AS CNT FROM STYLES@JDS25QA_LINK WHERE ROWNUM <= 1`
    );
    
    console.log('✅ DB link test successful!');
    console.log(`   Query result: ${testResult.rows?.[0]?.CNT || 0} row(s)\n`);

    // Display connection info
    console.log('📋 DB Link Details:');
    console.log(`   Name: JDS25QA_LINK`);
    console.log(`   User: ${JDS25QA_CONFIG.user}`);
    console.log(`   Host: 100.90.37.11:1521`);
    console.log(`   Service: JDS25QA`);
    console.log(`   Status: ✅ Active\n`);

    console.log('🎉 DB link creation complete!');
    console.log('📝 Usage: SELECT * FROM STYLES@JDS25QA_LINK WHERE ...');
    
  } catch (err) {
    console.error('❌ Error creating DB link:', err.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Verify JDS25QA credentials are correct');
    console.error('   2. Verify network connectivity to 100.90.37.11:1521');
    console.error('   3. Verify Oracle Thick mode is enabled (for old password verifier)');
    console.error('   4. Check if JDS25QA is accessible from your network');
    throw err;
  } finally {
    if (conn) {
      try {
        await conn.close();
        console.log('\n✅ Connection closed');
      } catch (err) {
        console.error('⚠️  Error closing connection:', err.message);
      }
    }
  }
}

// Run
createDbLink()
  .then(() => {
    console.log('\n✨ Script completed successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Script failed:', err.message);
    process.exit(1);
  });

