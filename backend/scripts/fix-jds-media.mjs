import oracledb from 'oracledb';
import { config } from '../dist/config.js';
import { SettingsService } from '../dist/services/settings.service.js';
import { createPool } from '../dist/services/oracle-pool.js';

async function fixJds() {
  console.log('🔄 Switching to JDS_MPRD and refreshing media...');
  try {
    await createPool(config.oracle);
    const settings = await SettingsService.getInstance();
    
    await settings.switchEnvironment('JDS_MPRD', 'ADMIN');
    console.log('✅ Switched to JDS_MPRD');

    // Wait for auto-sync to finish or manually trigger media refresh
    // Manual trigger is safer for this test
    await withConnection(async (conn) => {
      console.log('🔄 Manually refreshing JDS media...');
      await conn.execute("BEGIN ATTR_MGR.REFRESH_CATALOG_MEDIA('JDS_MPRD', 1); END;");
      console.log('✅ JDS media refreshed.');
    });

  } catch (e) {
    console.error('❌ JDS Fix Failed:', e.message);
  }
}

async function withConnection(fn) {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    return await fn(conn);
  } finally {
    if (conn) await conn.close();
  }
}

fixJds();

