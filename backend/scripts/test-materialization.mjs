import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function test() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    console.log('Testing image materialization for JDS style 00000002.png...');
    
    // Clear cache first for clean test
    await conn.execute("DELETE FROM ATTR_MGR.IMAGE_PROXY_CACHE WHERE IMAGE_NAME = '00000002.png'");
    
    await conn.execute(
      "BEGIN ATTR_MGR.FETCH_REMOTE_IMAGE('JDS_MPRD', '00000002.png'); END;"
    );
    
    const res = await conn.execute(
      "SELECT image_name, DBMS_LOB.GETLENGTH(blob_data) as len FROM ATTR_MGR.IMAGE_PROXY_CACHE WHERE image_name = '00000002.png'"
    );
    console.table(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    if(conn) await conn.close();
  }
}

test();

