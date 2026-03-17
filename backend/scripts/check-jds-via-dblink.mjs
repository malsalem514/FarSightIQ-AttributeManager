/**
 * Check if JDS25QA is accessible via database link from MERCH database
 */

import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function checkJDSViaDBLink() {
  let conn;
  try {
    console.log('🔍 Connecting to MERCH database to check for JDS25QA database links...\n');
    console.log('='.repeat(80));
    
    conn = await oracledb.getConnection({
      user: 'merch',
      password: 'merch',
      connectString: 'nrf-oci-db-01/demodb',
      connectionTimeout: 10000
    });

    console.log('\n✅ Connected to MERCH database\n');
    
    // 1. Check for database links
    console.log('1️⃣  Database Links:\n');
    const dbLinksResult = await conn.execute(`
      SELECT db_link, username, host, created
      FROM user_db_links
      ORDER BY db_link
    `);
    
    if (dbLinksResult.rows.length > 0) {
      console.log(`   Found ${dbLinksResult.rows.length} database link(s):\n`);
      dbLinksResult.rows.forEach((row, idx) => {
        console.log(`   ${idx + 1}. ${row.DB_LINK}`);
        console.log(`      Username: ${row.USERNAME || '(public)'}`);
        console.log(`      Host: ${row.HOST}`);
        console.log(`      Created: ${row.CREATED}`);
        console.log('');
      });
      
      // Check if any link contains 'jds'
      const jdsLinks = dbLinksResult.rows.filter(r => 
        r.DB_LINK.toLowerCase().includes('jds') || 
        r.HOST.toLowerCase().includes('jds')
      );
      
      if (jdsLinks.length > 0) {
        console.log('   ✅ Found JDS-related database link(s)!\n');
        jdsLinks.forEach(link => {
          console.log(`   📌 ${link.DB_LINK}`);
          console.log(`      Can be accessed as: tablename@${link.DB_LINK}`);
        });
      } else {
        console.log('   ℹ️  No JDS-related database links found');
      }
    } else {
      console.log('   ℹ️  No database links found in MERCH user schema');
    }
    
    // 2. Check all_db_links (public + user links)
    console.log('\n\n2️⃣  All Available Database Links (including public):\n');
    const allLinksResult = await conn.execute(`
      SELECT db_link, owner, username, host
      FROM all_db_links
      WHERE UPPER(db_link) LIKE '%JDS%' OR UPPER(host) LIKE '%JDS%'
      ORDER BY owner, db_link
    `);
    
    if (allLinksResult.rows.length > 0) {
      console.log(`   ✅ Found ${allLinksResult.rows.length} JDS-related link(s):\n`);
      allLinksResult.rows.forEach((row, idx) => {
        console.log(`   ${idx + 1}. ${row.DB_LINK} (Owner: ${row.OWNER})`);
        console.log(`      Username: ${row.USERNAME || '(public)'}`);
        console.log(`      Host: ${row.HOST}`);
        console.log('');
      });
    } else {
      console.log('   ℹ️  No JDS-related database links found');
    }
    
    // 3. Try to query via potential link names
    console.log('\n3️⃣  Attempting to connect via potential link names:\n');
    const potentialLinks = ['JDS25QA', 'JDS25QA_REMOTE', 'JDS_REMOTE'];
    
    for (const linkName of potentialLinks) {
      try {
        console.log(`   Testing: ${linkName}...`);
        const testResult = await conn.execute(`
          SELECT 1 as test_value FROM DUAL@${linkName}
        `);
        
        if (testResult.rows.length > 0) {
          console.log(`   ✅ SUCCESS! Can connect via ${linkName}`);
          
          // Try to get STYLES table structure
          console.log(`      Checking for STYLES table...`);
          const stylesCheck = await conn.execute(`
            SELECT COUNT(*) as table_exists
            FROM all_tables@${linkName}
            WHERE owner = 'MERCH' AND table_name = 'STYLES'
          `);
          
          if (stylesCheck.rows[0].TABLE_EXISTS > 0) {
            console.log(`      ✅ STYLES table found!`);
            
            // Get sample columns
            const colsResult = await conn.execute(`
              SELECT column_name
              FROM all_tab_columns@${linkName}
              WHERE owner = 'MERCH' AND table_name = 'STYLES' AND ROWNUM <= 10
            `);
            
            console.log(`      Sample columns (first 10):`);
            colsResult.rows.forEach(row => {
              console.log(`        - ${row.COLUMN_NAME}`);
            });
          }
        }
      } catch (err) {
        console.log(`   ❌ Failed: ${err.message.split('\n')[0]}`);
      }
      console.log('');
    }
    
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    throw error;
  } finally {
    if (conn) {
      try {
        await conn.close();
        console.log('\n✅ Connection closed');
      } catch (err) {
        console.error('Error closing connection:', err.message);
      }
    }
  }
}

checkJDSViaDBLink().catch(console.error);

