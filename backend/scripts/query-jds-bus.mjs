/**
 * Query all Business Units in JDS25QA
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

async function queryJDSBUs() {
  let conn;
  
  try {
    console.log('🔗 Connecting to attr_mgr (via MERCH_REMOTE → JDS25QA)...\n');
    conn = await oracledb.getConnection(config);
    
    // Get all BUs with style counts
    console.log('📊 Querying Business Units in JDS25QA:\n');
    const result = await conn.execute(
      `SELECT 
        BUSINESS_UNIT_ID,
        COUNT(DISTINCT STYLE_ID) AS STYLE_COUNT,
        MIN(STYLE_ID) AS FIRST_STYLE,
        MAX(STYLE_ID) AS LAST_STYLE
      FROM STYLES
      GROUP BY BUSINESS_UNIT_ID
      ORDER BY BUSINESS_UNIT_ID`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    if (result.rows && result.rows.length > 0) {
      console.log(`✅ Found ${result.rows.length} Business Unit(s):\n`);
      
      let totalStyles = 0;
      result.rows.forEach(row => {
        console.log(`BU ${row.BUSINESS_UNIT_ID}:`);
        console.log(`   Styles: ${row.STYLE_COUNT.toLocaleString()}`);
        console.log(`   Range: ${row.FIRST_STYLE} → ${row.LAST_STYLE}\n`);
        totalStyles += row.STYLE_COUNT;
      });
      
      console.log(`📈 Total: ${totalStyles.toLocaleString()} styles across ${result.rows.length} BU(s)`);
    } else {
      console.log('❌ No Business Units found!');
    }
    
    // Check MERCH_REMOTE target
    console.log('\n🔗 Current DB Link:');
    const linkResult = await conn.execute(
      `SELECT host FROM user_db_links WHERE db_link = 'MERCH_REMOTE'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    if (linkResult.rows && linkResult.rows.length > 0) {
      const host = linkResult.rows[0].HOST;
      if (host.includes('JDS25QA')) {
        console.log('   ✅ MERCH_REMOTE → JDS25QA');
      } else if (host.includes('VCP19QA')) {
        console.log('   ⚠️  MERCH_REMOTE → VCP19QA (not JDS!)');
      } else {
        console.log(`   📍 MERCH_REMOTE → ${host}`);
      }
    }
    
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
queryJDSBUs()
  .then(() => {
    console.log('\n✨ Query complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Failed:', err.message);
    process.exit(1);
  });

