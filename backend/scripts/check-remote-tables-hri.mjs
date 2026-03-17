import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    console.log('Checking tables on HRI link...');
    const res = await conn.execute(
      "SELECT table_name FROM all_tables@MERCH_HRI_LNK WHERE table_name LIKE '%IMAGE%'"
    );
    console.table(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    if(conn) await conn.close();
  }
}

check();

