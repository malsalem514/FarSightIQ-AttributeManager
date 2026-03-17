import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    const res = await conn.execute(
      `SELECT object_name, object_type, status 
       FROM user_objects 
       WHERE object_name IN ('REFRESH_CATALOG_CACHE', 'REFRESH_CATALOG_MEDIA', 'PROMOTION_PKG', 'FETCH_REMOTE_IMAGE')
       ORDER BY object_type, object_name`
    );
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

