import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    
    const styleId = '51341408';
    const tenantId = 'HRI_MPRD';
    
    const res = await conn.execute(
      `SELECT style_id, image_urls_json, has_image_ind 
       FROM CATALOG_CACHE_SHADOW 
       WHERE tenant_id = :tenantId AND style_id = :styleId`,
      { tenantId, styleId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    console.log('Cache status for 51341408:', res.rows[0]);

  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

