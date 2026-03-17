/**
 * Fix Shopify Credentials Configuration
 * 
 * This script ensures the Shopify credentials are properly set up
 * in the SHOPIFY_CONFIG table with the correct keys.
 */

import oracledb from 'oracledb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

const DB_USER = process.env.ORACLE_USER || 'ATTR_MGR';
const DB_PASSWORD = process.env.ORACLE_PASSWORD;
const DB_CONNECT_STRING = process.env.ORACLE_CONNECT_STRING || '100.90.84.20:1521/demodb';

async function fixCredentials() {
  let connection;
  
  try {
    console.log('\n===========================================');
    console.log('  FIXING SHOPIFY CREDENTIALS');
    console.log('===========================================\n');
    
    // Connect to database
    console.log(`Connecting to: ${DB_USER}@${DB_CONNECT_STRING}...`);
    connection = await oracledb.getConnection({
      user: DB_USER,
      password: DB_PASSWORD,
      connectString: DB_CONNECT_STRING
    });
    console.log('✓ Connected to database\n');
    
    // Define credentials
    const credentials = [
      {
        key: 'JESTA_DEMO_STORE_URL',
        value: 'https://jesta-demo.myshopify.com',
        desc: 'JESTA Demo Store URL',
        is_sensitive: 'N'
      },
      {
        key: 'JESTA_DEMO_ACCESS_TOKEN',
        value: 'shpat_CHANGE_ME',
        desc: 'JESTA Demo Store Access Token',
        is_sensitive: 'Y'
      },
      {
        key: 'JESTA_DEMO_LOCATION_ID',
        value: null,
        desc: 'JESTA Demo Store Location ID (auto-fetched)',
        is_sensitive: 'N'
      },
      {
        key: 'DEMO_DEMO_STORE_URL',
        value: 'https://jesta-demo.myshopify.com',
        desc: 'DEMO Store URL (fallback)',
        is_sensitive: 'N'
      },
      {
        key: 'DEMO_DEMO_ACCESS_TOKEN',
        value: 'shpat_CHANGE_ME',
        desc: 'DEMO Store Access Token (fallback)',
        is_sensitive: 'Y'
      }
    ];
    
    // Upsert credentials
    for (const cred of credentials) {
      try {
        // Try insert
        await connection.execute(
          `INSERT INTO SHOPIFY_CONFIG (CONFIG_KEY, CONFIG_VALUE, DESCRIPTION, IS_SENSITIVE)
           VALUES (:key, :value, :description, :is_sensitive)`,
          {
            key: cred.key,
            value: cred.value,
            description: cred.desc,
            is_sensitive: cred.is_sensitive
          },
          { autoCommit: false }
        );
        console.log(`✓ Inserted ${cred.key}`);
      } catch (e) {
        if (e.errorNum === 1) {
          // Duplicate - update instead
          await connection.execute(
            `UPDATE SHOPIFY_CONFIG 
             SET CONFIG_VALUE = :value, DESCRIPTION = :description, IS_SENSITIVE = :is_sensitive
             WHERE CONFIG_KEY = :key`,
            {
              key: cred.key,
              value: cred.value,
              description: cred.desc,
              is_sensitive: cred.is_sensitive
            },
            { autoCommit: false }
          );
          console.log(`✓ Updated ${cred.key}`);
        } else {
          throw e;
        }
      }
    }
    
    // Commit
    await connection.commit();
    console.log('\n✓ All credentials committed\n');
    
    // Verify
    console.log('===========================================');
    console.log('  VERIFICATION');
    console.log('===========================================\n');
    
    const result = await connection.execute(
      `SELECT CONFIG_KEY, 
              CASE 
                WHEN IS_SENSITIVE = 'Y' THEN '***' || SUBSTR(CONFIG_VALUE, -8)
                ELSE CONFIG_VALUE 
              END as CONFIG_VALUE,
              DESCRIPTION
       FROM SHOPIFY_CONFIG
       WHERE CONFIG_KEY LIKE '%DEMO%'
       ORDER BY CONFIG_KEY`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    console.log('Current configuration:');
    console.table(result.rows);
    
    console.log('\n===========================================');
    console.log('  ✅ CREDENTIALS FIXED!');
    console.log('===========================================\n');
    console.log('You can now test with:');
    console.log('  Banner ID: JESTA or DEMO');
    console.log('  Store URL: https://jesta-demo.myshopify.com');
    console.log('  API Version: 2024-10\n');
    
    // Test credentials by making a simple API call
    console.log('Testing Shopify API connection...');
    const shopifyUrl = 'https://jesta-demo.myshopify.com';
    const accessToken = 'shpat_CHANGE_ME';
    
    const response = await fetch(`${shopifyUrl}/admin/api/2024-10/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ API Test SUCCESS: Connected to ${data.shop.name}`);
    } else {
      console.log(`⚠️ API Test FAILED: ${response.status} ${response.statusText}`);
    }
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (connection) {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (connection) {
      try {
        await connection.close();
        console.log('\n✓ Database connection closed');
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
}

// Run
fixCredentials()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Fatal error:', err);
    process.exit(1);
  });
