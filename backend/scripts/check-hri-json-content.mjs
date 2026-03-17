import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    
    const styleId = '51341408';
    const tenantId = 'HRI_MPRD';
    
    const res = await conn.execute(
      `SELECT image_urls_json FROM CATALOG_CACHE_SHADOW WHERE tenant_id = :tenantId AND style_id = :styleId`,
      { tenantId, styleId }
    );
    
    const lob = res.rows[0][0];
    const content = await lob.getData();
    console.log('JSON Content for 51341408:', content);

  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

