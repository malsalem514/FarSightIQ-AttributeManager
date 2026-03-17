/**
 * Check which database MERCH_REMOTE currently points to
 */

import oracledb from 'oracledb';

// Enable Thick mode
try {
  oracledb.initOracleClient();
} catch (err) {
  // Already initialized
}

const config = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1'
};

async function checkCurrentDBLink() {
  let conn;
  
  try {
    console.log('🔗 Connecting to attr_mgr schema...\n');
    conn = await oracledb.getConnection(config);
    
    // Check MERCH_REMOTE
    const result = await conn.execute(
      `SELECT db_link, username, host 
       FROM user_db_links 
       WHERE db_link = 'MERCH_REMOTE'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    if (result.rows && result.rows.length > 0) {
      const link = result.rows[0];
      console.log('✅ MERCH_REMOTE DB Link:');
      console.log(`   User: ${link.USERNAME}`);
      console.log(`   Host: ${link.HOST}\n`);
      
      // Determine which database
      if (link.HOST.includes('VCP19QA')) {
        console.log('📍 Currently pointing to: VCP19QA (srv-db-101)');
        console.log('💡 To switch to JDS25QA, run: node scripts/switch-to-jds25qa.mjs\n');
      } else if (link.HOST.includes('JDS25QA')) {
        console.log('📍 Currently pointing to: JDS25QA (100.90.37.11)');
        console.log('✅ Already on JDS25QA!\n');
      } else {
        console.log('📍 Currently pointing to: Unknown database');
        console.log(`   Host: ${link.HOST}\n`);
      }
    } else {
      console.log('❌ MERCH_REMOTE DB link not found!');
    }
    
    // Test connection
    console.log('🧪 Testing connection...');
    const testResult = await conn.execute(
      `SELECT COUNT(*) as count FROM STYLES`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    console.log(`✅ Connection works! Found ${testResult.rows[0].COUNT} styles\n`);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (err) {
        console.error('⚠️  Error closing connection:', err.message);
      }
    }
  }
}

// Run
checkCurrentDBLink()
  .then(() => {
    console.log('✨ Check complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Failed:', err.message);
    process.exit(1);
  });

