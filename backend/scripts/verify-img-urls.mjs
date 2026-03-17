import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    const res = await conn.execute(
      "SELECT style_id, image_urls_json FROM CATALOG_CACHE_SHADOW WHERE tenant_id = 'OCI' AND has_image_ind = 'Y' FETCH NEXT 5 ROWS ONLY"
    );
    for (const row of res.rows) {
      const lob = row[1];
      const content = await lob.getData();
      console.log(`Style: ${row[0]} | JSON: ${content}`);
    }
  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

