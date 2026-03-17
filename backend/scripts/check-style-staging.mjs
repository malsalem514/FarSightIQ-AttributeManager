import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    const res = await conn.execute(
      "SELECT * FROM STYLE_IMAGE_STAGING WHERE tenant_id = 'OCI' AND style_id = '0010009'"
    );
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

