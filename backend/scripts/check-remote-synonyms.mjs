import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    console.log('Checking synonyms on JDS link...');
    const res = await conn.execute(
      "SELECT synonym_name, table_name, table_owner FROM all_synonyms@MERCH_JDS_LNK WHERE synonym_name = 'CENTRAL_IMAGES'"
    );
    console.table(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    if(conn) await conn.close();
  }
}

check();

