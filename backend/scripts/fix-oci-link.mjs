import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function fix() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    console.log('🚀 Fixing System Link for OCI...');

    // 1. Update environment record
    await conn.execute(
      "UPDATE APP_ENVIRONMENTS SET DB_LINK_NAME = 'MERCH_OCI_LNK' WHERE ENV_ID = 'OCI'"
    );
    console.log('✅ Updated APP_ENVIRONMENTS');

    // 2. Repoint synonyms
    await conn.execute(
      "BEGIN ENV_SWITCHER_PKG.repoint_synonyms('MERCH_OCI_LNK'); END;"
    );
    console.log('✅ Repointed synonyms to MERCH_OCI_LNK');

    await conn.commit();
    console.log('\n✨ System Link restored. Please refresh the dashboard.');

  } catch (e) {
    console.error('❌ Fix Failed:', e.message);
  } finally {
    if (conn) await conn.close();
  }
}

fix();

