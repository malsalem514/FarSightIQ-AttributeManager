import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function fix() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    console.log('🚀 Fixing DB Links for OCI Demo (Final Pass)...');

    // 1. Re-create MERCH_OCI_LNK
    try { await conn.execute("DROP DATABASE LINK MERCH_OCI_LNK"); } catch(e) {}
    await conn.execute(
      "CREATE DATABASE LINK MERCH_OCI_LNK CONNECT TO merch IDENTIFIED BY merch USING 'nrf-oci-db-01:1521/demodb'"
    );
    console.log('✅ Re-created MERCH_OCI_LNK');

    // 2. Ensure APP_ENVIRONMENTS points to it
    await conn.execute(
      "UPDATE APP_ENVIRONMENTS SET DB_LINK_NAME = 'MERCH_OCI_LNK' WHERE ENV_ID = 'OCI'"
    );
    console.log('✅ Updated APP_ENVIRONMENTS for OCI');

    // 3. Repoint synonyms via Switcher
    await conn.execute(
      "BEGIN ENV_SWITCHER_PKG.repoint_synonyms('MERCH_OCI_LNK'); END;"
    );
    console.log('✅ Repointed synonyms to MERCH_OCI_LNK');

    // 4. Manual fix for VENDORS
    await conn.execute(
      "CREATE OR REPLACE SYNONYM VENDORS FOR MERCH.VENDORS@MERCH_OCI_LNK"
    );
    console.log('✅ Manually repointed VENDORS synonym to MERCH_OCI_LNK');

    await conn.commit();
    console.log('\n✨ OCI System Link fixed. Please refresh the dashboard.');

  } catch (e) {
    console.error('❌ Fix Failed:', e.message);
  } finally {
    if (conn) await conn.close();
  }
}

fix();

