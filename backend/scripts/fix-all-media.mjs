import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function fixAll() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    console.log('🚀 Fixing Image Base URLs for ALL environments...');

    const proxyUrl = 'http://localhost:3002/api/images/';
    
    await conn.execute(
      "UPDATE ATTR_MGR.APP_ENVIRONMENTS SET IMAGE_BASE_URL = :url",
      { url: proxyUrl }
    );
    console.log(`✅ Set all environments to: ${proxyUrl}`);

    await conn.commit();

    // Trigger full refresh for active tenant (assuming OCI for now based on context)
    const activeRes = await conn.execute("SELECT env_id FROM APP_ENVIRONMENTS WHERE is_active = 'Y'");
    const activeTenant = activeRes.rows[0][0];
    
    console.log(`🔄 Performing FULL media refresh for ${activeTenant}...`);
    // Clear shadow media first to ensure no leftovers
    await conn.execute(
      "UPDATE CATALOG_CACHE_SHADOW SET IMAGE_URLS_JSON = NULL, HAS_IMAGE_IND = 'N' WHERE TENANT_ID = :tenant",
      { tenant: activeTenant }
    );
    
    await conn.execute("BEGIN ATTR_MGR.REFRESH_CATALOG_MEDIA(:tenant, 1); END;", { tenant: activeTenant });
    console.log('✅ Media refresh complete.');

    await conn.commit();

  } catch (e) {
    console.error('❌ Fix Failed:', e.message);
  } finally {
    if (conn) await conn.close();
  }
}

fixAll();

