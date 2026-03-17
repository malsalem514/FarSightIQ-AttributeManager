import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    console.log('=== User Synonyms (Full) ===');
    const res = await conn.execute(
      "SELECT synonym_name, table_owner, table_name, db_link FROM user_synonyms WHERE synonym_name IN ('STYLES', 'VENDORS', 'BUSINESS_UNITS')"
    );
    console.table(res.rows);
    
    console.log('\n=== user_db_links Host ===');
    const linksRes = await conn.execute(
      "SELECT db_link, host FROM user_db_links"
    );
    console.table(linksRes.rows);
  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

