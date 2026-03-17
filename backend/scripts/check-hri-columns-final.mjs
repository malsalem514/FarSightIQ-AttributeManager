import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    
    console.log('Checking columns of STYLE_IMAGES@MERCH_HRI_LNK...');
    const res = await conn.execute(
      "SELECT column_name, data_type FROM all_tab_columns@MERCH_HRI_LNK WHERE table_name = 'STYLE_IMAGES' ORDER BY column_id"
    );
    console.table(res.rows);
    
    console.log('Checking columns of IMAGES@MERCH_HRI_LNK...');
    const res2 = await conn.execute(
      "SELECT column_name, data_type FROM all_tab_columns@MERCH_HRI_LNK WHERE table_name = 'IMAGES' ORDER BY column_id"
    );
    console.table(res2.rows);

  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

