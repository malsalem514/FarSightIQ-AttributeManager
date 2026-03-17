import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    
    const styleId = '20183648';
    const tenantId = 'HRI_MPRD';
    
    console.log(`Checking Style ${styleId} for Tenant ${tenantId}...`);
    
    const res = await conn.execute(
      `SELECT style_id, image_urls_json, has_image_ind, business_unit_id 
       FROM CATALOG_CACHE_SHADOW 
       WHERE tenant_id = :tenantId AND style_id = :styleId`,
      { tenantId, styleId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    if (res.rows.length === 0) {
      console.log('❌ Style not found in CATALOG_CACHE_SHADOW.');
      
      // Check if it exists for ANY tenant
      const anyTenant = await conn.execute(
        `SELECT tenant_id, business_unit_id FROM CATALOG_CACHE_SHADOW WHERE style_id = :styleId`,
        { styleId }
      );
      console.log('Existance in other tenants:', anyTenant.rows);
    } else {
      const row = res.rows[0];
      console.log('✅ Row found:', row);
      if (row.IMAGE_URLS_JSON) {
        const lob = row.IMAGE_URLS_JSON;
        const content = await lob.getData();
        console.log('JSON Content:', content);
      }
    }
    
    // Check synonyms
    const syns = await conn.execute(
      "SELECT synonym_name, table_name, db_link FROM user_synonyms WHERE synonym_name IN ('STYLE_IMAGES', 'CENTRAL_IMAGES')"
    );
    console.log('Current Synonyms:', syns.rows);

  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

