import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    
    console.log('Checking owners of STYLE_IMAGES on HRI link...');
    const res = await conn.execute(
      "SELECT owner, table_name FROM all_tables@MERCH_HRI_LNK WHERE table_name = 'STYLE_IMAGES'"
    );
    console.table(res.rows);
    
    console.log('Checking owners of IMAGES on HRI link...');
    const res2 = await conn.execute(
      "SELECT owner, table_name FROM all_tables@MERCH_HRI_LNK WHERE table_name = 'IMAGES'"
    );
    console.table(res2.rows);

  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

