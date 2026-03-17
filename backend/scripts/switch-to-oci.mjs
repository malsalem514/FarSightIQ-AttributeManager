import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function switchAndTest(envId) {
  console.log(`\n🔄 Switching to: ${envId}`);
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    await conn.execute(
      "BEGIN ENV_SWITCHER_PKG.switch_environment(:env, 'SMOKE_TEST', :status, :err); END;",
      {
        env: envId,
        status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 100 },
        err: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 1000 }
      }
    );
  } catch (err) {
    console.error(`💥 Failed to switch:`, err.message);
  } finally {
    if (conn) await conn.close();
  }
}

switchAndTest('OCI');

