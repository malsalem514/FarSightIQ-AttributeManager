/**
 * Test Shopify Credentials Retrieval
 * Debug what's happening when getCredentials is called
 */

import oracledb from 'oracledb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const DB_USER = process.env.ORACLE_USER;
const DB_PASSWORD = process.env.ORACLE_PASSWORD;
const DB_CONNECT_STRING = process.env.ORACLE_CONNECT_STRING;

async function testCredentials() {
  let connection;
  
  try {
    console.log('\n===========================================');
    console.log('  TESTING CREDENTIALS RETRIEVAL');
    console.log('===========================================\n');
    
    connection = await oracledb.getConnection({
      user: DB_USER,
      password: DB_PASSWORD,
      connectString: DB_CONNECT_STRING
    });
    console.log('✓ Connected to database\n');
    
    // Test 1: Check if SHOPIFY_CONFIG table exists
    console.log('TEST 1: Check SHOPIFY_CONFIG table...');
    try {
      const tableCheck = await connection.execute(
        `SELECT COUNT(*) as CNT FROM ALL_TABLES WHERE TABLE_NAME = 'SHOPIFY_CONFIG' AND OWNER = 'ATTR_MGR'`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      console.log(`Table exists: ${tableCheck.rows[0].CNT > 0 ? 'YES' : 'NO'}`);
    } catch (e) {
      console.log(`❌ Error checking table: ${e.message}`);
    }
    
    // Test 2: Query ALL rows in SHOPIFY_CONFIG
    console.log('\nTEST 2: Query all SHOPIFY_CONFIG rows...');
    try {
      const allRows = await connection.execute(
        `SELECT CONFIG_KEY, 
                CASE WHEN IS_SENSITIVE = 'Y' THEN '***' || SUBSTR(CONFIG_VALUE, -8) ELSE CONFIG_VALUE END as CONFIG_VALUE
         FROM ATTR_MGR.SHOPIFY_CONFIG
         ORDER BY CONFIG_KEY`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      console.log(`Found ${allRows.rows.length} rows:`);
      console.table(allRows.rows);
    } catch (e) {
      console.log(`❌ Error querying all rows: ${e.message}`);
    }
    
    // Test 3: Simulate the exact query from getCredentials
    console.log('\nTEST 3: Simulate getCredentials query for JESTA...');
    try {
      const configRes = await connection.execute(
        `SELECT CONFIG_KEY, CONFIG_VALUE FROM ATTR_MGR.SHOPIFY_CONFIG 
         WHERE CONFIG_KEY IN ('DEMO_STORE_URL', 'SHOPIFY_ACCESS_TOKEN',
                              'JESTA_DEMO_STORE_URL', 'JESTA_DEMO_ACCESS_TOKEN', 'JESTA_DEMO_LOCATION_ID')`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      console.log(`Found ${configRes.rows.length} matching keys:`);
      console.table(configRes.rows);
      
      // Simulate the config building
      const config = {};
      configRes.rows.forEach((r) => { config[r.CONFIG_KEY] = r.CONFIG_VALUE; });
      
      console.log('\nBuilt config object:');
      console.log(JSON.stringify(config, null, 2));
      
      const shopUrl = config.JESTA_DEMO_STORE_URL || config.DEMO_STORE_URL;
      const accessToken = config.JESTA_DEMO_ACCESS_TOKEN || config.SHOPIFY_ACCESS_TOKEN;
      const locationId = config.JESTA_DEMO_LOCATION_ID;
      
      console.log('\nResolved values:');
      console.log(`  shopUrl: ${shopUrl ? shopUrl.substring(0, 30) + '...' : 'NULL'}`);
      console.log(`  accessToken: ${accessToken ? '***' + accessToken.substring(accessToken.length - 8) : 'NULL'}`);
      console.log(`  locationId: ${locationId || 'NULL'}`);
      
      if (shopUrl && accessToken) {
        console.log('\n✅ Credentials FOUND and VALID');
      } else {
        console.log('\n❌ Credentials MISSING or INVALID');
        console.log(`  Missing: ${!shopUrl ? 'shopUrl ' : ''}${!accessToken ? 'accessToken' : ''}`);
      }
      
    } catch (e) {
      console.log(`❌ Error in getCredentials simulation: ${e.message}`);
    }
    
    // Test 4: Check for DEMO banner
    console.log('\n===========================================');
    console.log('TEST 4: Check DEMO banner credentials...');
    try {
      const demoRes = await connection.execute(
        `SELECT CONFIG_KEY, CONFIG_VALUE FROM ATTR_MGR.SHOPIFY_CONFIG 
         WHERE CONFIG_KEY IN ('DEMO_DEMO_STORE_URL', 'DEMO_DEMO_ACCESS_TOKEN')`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      console.log(`Found ${demoRes.rows.length} DEMO keys:`);
      console.table(demoRes.rows);
      
    } catch (e) {
      console.log(`❌ Error checking DEMO: ${e.message}`);
    }
    
    console.log('\n===========================================');
    console.log('  TEST COMPLETE');
    console.log('===========================================\n');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    throw error;
  } finally {
    if (connection) {
      try {
        await connection.close();
        console.log('✓ Database connection closed\n');
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
}

testCredentials()
  .then(() => {
    console.log('✨ Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  });
