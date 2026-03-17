import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function read() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    const res = await conn.execute(
      "SELECT text FROM user_source WHERE name = 'REFRESH_CATALOG_MEDIA' ORDER BY line"
    );
    res.rows.forEach(r => process.stdout.write(r[0]));
  } catch(e) {
    console.error(e);
  } finally {
    if(conn) await conn.close();
  }
}

read();

