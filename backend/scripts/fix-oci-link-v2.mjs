import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function fix() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    console.log('🚀 Fixing DB Links for OCI Demo...');

    // 1. Drop and Re-create MERCH_OCI_LNK
    try { await conn.execute("DROP DATABASE LINK MERCH_OCI_LNK"); } catch(e) {}
    await conn.execute(
      "CREATE DATABASE LINK MERCH_OCI_LNK CONNECT TO merch IDENTIFIED BY merch USING 'nrf-oci-db-01:1521/demodb'"
    );
    console.log('✅ Created MERCH_OCI_LNK');

    // 2. Drop and Re-create MERCH_REMOTE (as it is the primary link for some synonyms)
    try { await conn.execute("DROP DATABASE LINK MERCH_REMOTE"); } catch(e) {}
    await conn.execute(
      "CREATE DATABASE LINK MERCH_REMOTE CONNECT TO merch IDENTIFIED BY merch USING 'nrf-oci-db-01:1521/demodb'"
    );
    console.log('✅ Created MERCH_REMOTE');

    // 3. Ensure APP_ENVIRONMENTS is correct
    await conn.execute(
      "UPDATE APP_ENVIRONMENTS SET DB_LINK_NAME = 'MERCH_REMOTE' WHERE ENV_ID = 'OCI'"
    );
    console.log('✅ Updated APP_ENVIRONMENTS for OCI');

    // 4. Repoint ALL synonyms using the switcher (which uses MERCH_REMOTE now for OCI)
    await conn.execute(
      "BEGIN ENV_SWITCHER_PKG.repoint_synonyms('MERCH_REMOTE'); END;"
    );
    console.log('✅ Repointed all synonyms to MERCH_REMOTE');

    // 5. Special fix for VENDORS which is missing from switcher list
    await conn.execute(
      "CREATE OR REPLACE SYNONYM VENDORS FOR MERCH.VENDORS@MERCH_REMOTE"
    );
    console.log('✅ Manually repointed VENDORS synonym');

    await conn.commit();
    console.log('\n✨ OCI System Link fixed. Please refresh the dashboard.');

  } catch (e) {
    console.error('❌ Fix Failed:', e.message);
  } finally {
    if (conn) await conn.close();
  }
}

fix();

