/**
 * Switch MERCH_REMOTE DB link from VCP19QA to JDS25QA
 * 
 * This is the SSOT (Single Source of Truth) for MERCH database connection.
 * All synonyms will automatically point to JDS25QA after this change.
 */

import oracledb from 'oracledb';

// Enable Thick mode (required for JDS25QA)
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

async function switchToJDS25QA() {
  let conn;
  
  try {
    console.log('🔗 Connecting to attr_mgr schema...\n');
    conn = await oracledb.getConnection(config);
    
    // Step 1: Drop existing MERCH_REMOTE
    console.log('1️⃣ Dropping old MERCH_REMOTE (VCP19QA)...');
    try {
      await conn.execute(`DROP DATABASE LINK MERCH_REMOTE`);
      console.log('   ✅ Dropped\n');
    } catch (err) {
      if (err.message.includes('ORA-02024')) {
        console.log('   ⚠️  Cannot drop - active connections exist');
        console.log('   💡 Close all backend connections and try again\n');
        throw new Error('Active connections prevent DB link drop');
      }
      throw err;
    }
    
    // Step 2: Create new MERCH_REMOTE pointing to JDS25QA
    console.log('2️⃣ Creating new MERCH_REMOTE (JDS25QA)...');
    await conn.execute(`
      CREATE DATABASE LINK MERCH_REMOTE
        CONNECT TO merch IDENTIFIED BY "jds25qacmcs12"
        USING '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=100.90.37.11)(PORT=1521))(CONNECT_DATA=(SERVER=DEDICATED)(SERVICE_NAME=JDS25QA)))'
    `);
    console.log('   ✅ Created\n');
    
    // Step 3: Test new connection
    console.log('3️⃣ Testing JDS25QA connection...');
    const testResult = await conn.execute(
      `SELECT COUNT(*) as count FROM STYLES`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    console.log(`   ✅ Connection works! Found ${testResult.rows[0].COUNT} styles in JDS25QA\n`);
    
    // Step 4: Get sample BUs
    console.log('4️⃣ Sample Business Units from JDS25QA:');
    const busResult = await conn.execute(
      `SELECT BUSINESS_UNIT_ID, COUNT(*) as count 
       FROM STYLES 
       GROUP BY BUSINESS_UNIT_ID 
       ORDER BY COUNT(*) DESC 
       FETCH FIRST 5 ROWS ONLY`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    busResult.rows.forEach(row => {
      console.log(`   BU ${row.BUSINESS_UNIT_ID}: ${row.COUNT} styles`);
    });
    
    console.log('\n✅ Switch complete!');
    console.log('📝 All synonyms now point to JDS25QA');
    console.log('🔄 Restart backend to apply changes: npm run dev\n');
    
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
switchToJDS25QA()
  .then(() => {
    console.log('✨ Switch to JDS25QA complete!');
    console.log('💡 Next: Restart backend and refresh frontend');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Failed:', err.message);
    console.error('\n💡 If "active connections" error:');
    console.error('   1. Stop backend (Ctrl+C in terminal)');
    console.error('   2. Run this script again');
    console.error('   3. Restart backend\n');
    process.exit(1);
  });

