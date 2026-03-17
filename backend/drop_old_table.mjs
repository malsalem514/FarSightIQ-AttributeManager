import oracledb from 'oracledb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function dropOldTable() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECT_STRING
    });

    console.log('--- Dropping legacy CATALOG_CACHE table ---');
    try {
        await conn.execute(`DROP TABLE ATTR_MGR.CATALOG_CACHE CASCADE CONSTRAINTS`);
        console.log('✓ TABLE CATALOG_CACHE dropped.');
    } catch (e) {
        if (e.errorNum === 942) {
            console.log('✓ TABLE CATALOG_CACHE does not exist.');
        } else {
            console.error('Error dropping table:', e.message);
        }
    }

    await conn.commit();

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (conn) await conn.close();
  }
}

dropOldTable();
