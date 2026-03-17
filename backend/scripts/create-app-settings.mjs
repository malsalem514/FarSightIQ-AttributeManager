/**
 * Create APP_SETTINGS table for runtime configuration
 */
import oracledb from 'oracledb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const config = {
  user: process.env.ORACLE_USER || 'attr_mgr',
  password: process.env.ORACLE_PASSWORD,
  connectString: process.env.ORACLE_CONNECT_STRING || 'localhost:1521/FREEPDB1'
};

if (!config.password) {
  console.error('ORACLE_PASSWORD not set in .env file');
  process.exit(1);
}

async function main() {
  let conn;
  try {
    console.log('Connecting to Oracle...');
    conn = await oracledb.getConnection(config);
    
    // Check if table exists
    const checkResult = await conn.execute(
      `SELECT COUNT(*) as CNT FROM USER_TABLES WHERE TABLE_NAME = 'APP_SETTINGS'`
    );
    
    const tableExists = checkResult.rows[0][0] > 0;
    
    if (tableExists) {
      console.log('APP_SETTINGS table already exists');
      
      // Check if batch settings exist
      const settingsCheck = await conn.execute(
        `SELECT COUNT(*) as CNT FROM APP_SETTINGS WHERE SETTING_GROUP = 'BATCH_PROCESSING'`
      );
      
      if (settingsCheck.rows[0][0] === 0) {
        console.log('Seeding default batch processing values...');
        
        const defaults = [
          ['BATCH_PROCESSING', 'MAX_CONCURRENT_REQUESTS', '5', 'Maximum parallel LLM API calls (1-50)'],
          ['BATCH_PROCESSING', 'BATCH_CHUNK_SIZE', '50', 'Items per batch before progress yield (10-500)'],
          ['BATCH_PROCESSING', 'REQUEST_TIMEOUT_MS', '30000', 'Max wait time per AI request in milliseconds'],
          ['BATCH_PROCESSING', 'RETRY_ATTEMPTS', '2', 'Automatic retries on failure (0-5)']
        ];
        
        for (const [group, key, value, desc] of defaults) {
          await conn.execute(
            `INSERT INTO APP_SETTINGS (SETTING_GROUP, SETTING_KEY, SETTING_VALUE, DESCRIPTION) 
             VALUES (:grp, :skey, :val, :descr)`,
            { grp: group, skey: key, val: value, descr: desc }
          );
        }
        
        await conn.commit();
        console.log('Defaults seeded');
      }
    } else {
      console.log('Creating APP_SETTINGS table...');
      
      await conn.execute(`
        CREATE TABLE APP_SETTINGS (
          SETTING_GROUP VARCHAR2(50) NOT NULL,
          SETTING_KEY VARCHAR2(50) NOT NULL,
          SETTING_VALUE VARCHAR2(500),
          DESCRIPTION VARCHAR2(500),
          CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          MODIFIED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT APP_SETTINGS_PK PRIMARY KEY (SETTING_GROUP, SETTING_KEY)
        )
      `);
      
      console.log('Table created successfully');
      
      // Seed defaults
      console.log('Seeding default values...');
      
      const defaults = [
        ['BATCH_PROCESSING', 'MAX_CONCURRENT_REQUESTS', '5', 'Maximum parallel LLM API calls (1-50)'],
        ['BATCH_PROCESSING', 'BATCH_CHUNK_SIZE', '50', 'Items per batch before progress yield (10-500)'],
        ['BATCH_PROCESSING', 'REQUEST_TIMEOUT_MS', '30000', 'Max wait time per AI request in milliseconds'],
        ['BATCH_PROCESSING', 'RETRY_ATTEMPTS', '2', 'Automatic retries on failure (0-5)']
      ];
      
      for (const [group, key, value, desc] of defaults) {
        await conn.execute(
          `INSERT INTO APP_SETTINGS (SETTING_GROUP, SETTING_KEY, SETTING_VALUE, DESCRIPTION) 
           VALUES (:grp, :skey, :val, :descr)`,
          { grp: group, skey: key, val: value, descr: desc }
        );
      }
      
      await conn.commit();
      console.log('Default values seeded');
    }
    
    // Verify
    const verifyResult = await conn.execute(
      `SELECT SETTING_KEY, SETTING_VALUE FROM APP_SETTINGS WHERE SETTING_GROUP = 'BATCH_PROCESSING'`
    );
    
    console.log('\nCurrent batch settings:');
    for (const row of verifyResult.rows) {
      console.log(`  ${row[0]}: ${row[1]}`);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.close();
  }
}

main();
