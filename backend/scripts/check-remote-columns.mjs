import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    console.log('Checking columns of IMAGES@MERCH_JDS_LNK...');
    const res = await conn.execute(
      "SELECT column_name, data_type FROM all_tab_columns@MERCH_JDS_LNK WHERE table_name = 'IMAGES' ORDER BY column_id"
    );
    console.table(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    if(conn) await conn.close();
  }
}

check();

