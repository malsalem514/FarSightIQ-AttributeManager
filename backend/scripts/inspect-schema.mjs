import oracledb from 'oracledb';

const config = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1'
};

async function run() {
  let conn;
  try {
    conn = await oracledb.getConnection(config);
    
    console.log('=== USER SYNONYMS ===');
    const synonymsRes = await conn.execute(
      "SELECT synonym_name, table_owner, table_name FROM user_synonyms",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log(JSON.stringify(synonymsRes.rows, null, 2));

    console.log('\n=== USER TABLES ===');
    const tablesRes = await conn.execute(
      "SELECT table_name FROM user_tables",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log(JSON.stringify(tablesRes.rows, null, 2));

    const tablesToInspect = ['AI_ATTRIBUTION_RESULTS', 'STYLE_CHARACTERISTIC_VALUES', 'PENDING_SYNCS'];
    for (const tableName of tablesToInspect) {
      console.log(`\n=== COLUMNS FOR ${tableName} ===`);
      const res = await conn.execute(
        `SELECT column_name, data_type FROM user_tab_columns WHERE table_name = '${tableName}' ORDER BY column_id`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      console.log(JSON.stringify(res.rows, null, 2));
    }

  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

run();

