import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function switchAndTest(envId) {
  console.log(`\n🔄 Testing Environment Switch to: ${envId}`);
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    
    const res = await conn.execute(
      "BEGIN ENV_SWITCHER_PKG.switch_environment(:env, 'SMOKE_TEST', :status, :err); END;",
      {
        env: envId,
        status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 100 },
        err: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 1000 }
      }
    );

    if (res.outBinds.status === 'SUCCESS') {
      console.log(`✅ Switched to ${envId} successfully.`);
    } else {
      console.error(`❌ Switch to ${envId} failed: ${res.outBinds.err}`);
    }

  } catch (err) {
    console.error(`💥 Critical failure switching to ${envId}:`, err.message);
  } finally {
    if (conn) await conn.close();
  }
}

async function run() {
  await switchAndTest('OCI');
  await switchAndTest('VCP19QA');
}

run();

