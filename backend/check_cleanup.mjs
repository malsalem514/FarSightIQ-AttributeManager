import oracledb from 'oracledb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function checkDependencies() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECT_STRING
    });

    console.log('--- Checking dependencies on CATALOG_CACHE ---');
    const res = await conn.execute(
        `SELECT name, type FROM user_dependencies WHERE referenced_name = 'CATALOG_CACHE'`
    );
    console.log('Dependencies:', res.rows);

    console.log('--- Checking for presence of CATALOG_CACHE table ---');
    const tableRes = await conn.execute(
        `SELECT table_name FROM user_tables WHERE table_name = 'CATALOG_CACHE'`
    );
    console.log('Table exists:', tableRes.rows.length > 0);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (conn) await conn.close();
  }
}

checkDependencies();

