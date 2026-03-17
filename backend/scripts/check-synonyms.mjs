/**
 * Check if synonyms exist in attr_mgr schema
 * 
 * Synonyms should point to MERCH tables via DB link
 */

import oracledb from 'oracledb';

// Enable Thick mode if needed
try {
  oracledb.initOracleClient();
} catch (err) {
  // Already initialized or not needed
}

const config = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1',
  connectionTimeoutMillis: 10000
};

async function checkSynonyms() {
  let conn;
  
  try {
    console.log('📡 Connecting to attr_mgr schema...');
    conn = await oracledb.getConnection(config);
    console.log('✅ Connected\n');

    // Check for synonyms
    console.log('🔍 Checking for synonyms...\n');
    const result = await conn.execute(
      `SELECT 
        synonym_name,
        table_owner,
        table_name,
        db_link
      FROM user_synonyms
      WHERE synonym_name IN (
        'STYLES',
        'STYLE_CHARACTERISTICS',
        'CHARACTERISTIC_TYPES',
        'CHARACTERISTIC_VALUES',
        'STYLE_IMAGES',
        'CENTRAL_IMAGES',
        'V_DEPT_CLASS_SUBCLASS',
        'BRANDS',
        'IRO_PLAN_HIERARCHY'
      )
      ORDER BY synonym_name`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows && result.rows.length > 0) {
      console.log('✅ Found synonyms:\n');
      result.rows.forEach(row => {
        const dbLink = row.DB_LINK || '(local)';
        console.log(`   ${row.SYNONYM_NAME}`);
        console.log(`      → ${row.TABLE_OWNER}.${row.TABLE_NAME}@${dbLink}\n`);
      });
    } else {
      console.log('❌ NO SYNONYMS FOUND!');
      console.log('\n💡 Synonyms should exist for:');
      console.log('   - STYLES');
      console.log('   - STYLE_CHARACTERISTICS');
      console.log('   - CHARACTERISTIC_TYPES');
      console.log('   - CHARACTERISTIC_VALUES');
      console.log('   - etc.\n');
      console.log('📝 Run: database/standalone/V001__attr_mgr_local.sql');
    }

    // Check DB links
    console.log('\n🔗 Checking DB links...\n');
    const linksResult = await conn.execute(
      `SELECT db_link, username, host FROM user_db_links ORDER BY db_link`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (linksResult.rows && linksResult.rows.length > 0) {
      console.log('✅ Found DB links:\n');
      linksResult.rows.forEach(row => {
        console.log(`   ${row.DB_LINK}`);
        console.log(`      User: ${row.USERNAME}`);
        console.log(`      Host: ${row.HOST}\n`);
      });
    } else {
      console.log('❌ NO DB LINKS FOUND!');
      console.log('\n💡 Create DB link first:');
      console.log('   CREATE DATABASE LINK MERCH_REMOTE');
      console.log('   CONNECT TO merch IDENTIFIED BY "password"');
      console.log('   USING \'srv-db-101/VCP19QA\';');
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
checkSynonyms()
  .then(() => {
    console.log('\n✨ Check complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Failed:', err.message);
    process.exit(1);
  });

