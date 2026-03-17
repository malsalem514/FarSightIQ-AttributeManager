import oracledb from 'oracledb';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function checkConnection() {
  const config = {
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  };

  console.log('Checking connection with config:', { ...config, password: '***' });

  let conn;
  try {
    conn = await oracledb.getConnection(config);
    const result = await conn.execute(`
      SELECT 
        (SELECT USER FROM DUAL) as CURRENT_USER,
        (SELECT sys_context('USERENV', 'DB_NAME') FROM DUAL) as DB_NAME,
        (SELECT sys_context('USERENV', 'CON_NAME') FROM DUAL) as CON_NAME
      FROM DUAL
    `);
    console.log('Connection Info:', result.rows[0]);
    
    // Check if CHARACTERISTIC_TYPES is visible
    try {
      const ctCheck = await conn.execute('SELECT count(*) FROM CHARACTERISTIC_TYPES FETCH FIRST 1 ROWS ONLY');
      console.log('CHARACTERISTIC_TYPES is visible. Row count:', ctCheck.rows[0]);
    } catch (e) {
      console.error('CHARACTERISTIC_TYPES is NOT visible or failed:', e.message);
    }

  } catch (err) {
    console.error('Connection failed:', err.message);
  } finally {
    if (conn) await conn.close();
  }
}

checkConnection();
