import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    const res = await conn.execute(
      "SELECT text FROM user_source WHERE name = 'REFRESH_CATALOG_MEDIA' AND type = 'PROCEDURE' ORDER BY line"
    );
    console.log(res.rows.map(r => r[0]).join(''));
  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

