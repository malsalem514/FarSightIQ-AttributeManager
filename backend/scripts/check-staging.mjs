import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    const res = await conn.execute(
      "SELECT style_id, img_url FROM STYLE_IMAGE_STAGING WHERE tenant_id = 'OCI' FETCH NEXT 5 ROWS ONLY"
    );
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

