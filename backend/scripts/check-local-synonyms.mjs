import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    console.log('Checking local synonyms...');
    const res = await conn.execute(
      "SELECT synonym_name, table_name, db_link FROM user_synonyms WHERE synonym_name IN ('CENTRAL_IMAGES', 'IMAGES', 'STYLE_IMAGES')"
    );
    console.table(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    if(conn) await conn.close();
  }
}

check();

