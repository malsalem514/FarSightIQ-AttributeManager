import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    
    console.log('Checking REMOTE synonyms on HRI link...');
    const res = await conn.execute(
      "SELECT synonym_name, table_owner, table_name FROM all_synonyms@MERCH_HRI_LNK WHERE synonym_name IN ('STYLE_IMAGES', 'IMAGES', 'CENTRAL_IMAGES')"
    );
    console.table(res.rows);

  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

