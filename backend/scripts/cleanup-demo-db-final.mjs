import oracledb from 'oracledb';

const config = {
  user: 'merch',
  password: 'merch',
  connectString: 'nrf-oci-db-01/demodb'
};

async function cleanup() {
  console.log('👁️  Sauron\'s Eye: Cleaning up Demo DB (Safe Reversal)...\n');
  let conn;
  try {
    conn = await oracledb.getConnection(config);
    console.log('✅ Connected to', config.connectString);

    // 1. List of objects explicitly created by MusaOS during this session
    const myObjects = [
      { type: 'PACKAGE', name: 'PROMOTION_PKG' },
      { type: 'TABLE', name: 'STAGING_IMAGES' },
      { type: 'TABLE', name: 'STAGING_STYLE_CHARACTERISTICS' },
      { type: 'TABLE', name: 'STAGING_STYLE_SIZES' },
      { type: 'TABLE', name: 'STAGING_STYLE_COLORS' },
      { type: 'TABLE', name: 'STAGING_STYLES' },
      { type: 'TABLE', name: 'AI_ATTRIBUTION_RESULTS' },
      { type: 'TABLE', name: 'ATTRIBUTE_EMBEDDING_CACHE' }
    ];

    console.log('\n--- Object Removal ---');
    for (const obj of myObjects) {
      try {
        await conn.execute(`DROP ${obj.type} ${obj.name}${obj.type === 'TABLE' ? ' CASCADE CONSTRAINTS' : ''}`);
        console.log(`  ✅ Dropped ${obj.type}: ${obj.name}`);
      } catch (err) {
        if (err.errorNum === 942 || err.errorNum === 4043) {
          console.log(`  ℹ️  ${obj.name} already absent.`);
        } else {
          console.error(`  ❌ Failed to drop ${obj.name}: ${err.message}`);
        }
      }
    }

    // 2. Data Cleanup (IRI Tables)
    // Even though E2E failed early, we check for 'ATTR_MGR' tagged records just in case
    console.log('\n--- Data Scruubing ---');
    const iriTables = ['IRI_WHSLE_STYLES', 'IRI_WHSLE_STYLE_CHARACTERISTIC', 'IRI_WHSLE_STYLE_FOREIGN_DESC'];
    for (const table of iriTables) {
      try {
        const res = await conn.execute(`DELETE FROM ${table} WHERE CREATED_BY = 'ATTR_MGR'`);
        if (res.rowsAffected && res.rowsAffected > 0) {
          console.log(`  ✅ Removed ${res.rowsAffected} test records from ${table}`);
        } else {
          console.log(`  ℹ️  No test data found in ${table}`);
        }
      } catch (err) {
        // Table might not have CREATED_BY or might not exist
        console.log(`  ℹ️  Skipping data cleanup for ${table} (Inaccessible or no test records)`);
      }
    }

    await conn.commit();
    console.log('\n✨ Demo DB cleanup complete. No standard Merch features impacted.');

  } catch (err) {
    console.error('\n❌ Cleanup Script Failed:', err.message);
  } finally {
    if (conn) await conn.close();
  }
}

cleanup();

