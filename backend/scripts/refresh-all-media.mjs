import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function refresh() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    console.log('Refreshing media for all active environments...');
    
    const envsRes = await conn.execute("SELECT env_id, default_bu_id FROM ATTR_MGR.APP_ENVIRONMENTS");
    for (const row of envsRes.rows) {
      const envId = row[0];
      const buId = row[1];
      console.log(`Refreshing ${envId} (BU ${buId})...`);
      try {
        await conn.execute(
          `BEGIN ATTR_MGR.REFRESH_CATALOG_MEDIA(:envId, :buId); END;`,
          { envId, buId }
        );
        console.log(`✅ ${envId} refreshed.`);
      } catch (e) {
        console.warn(`⚠️ Failed to refresh ${envId}:`, e.message);
      }
    }
    
    await conn.commit();
  } catch(e) {
    console.error(e);
  } finally {
    if(conn) await conn.close();
  }
}

refresh();

