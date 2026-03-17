import { withConnection, createPool } from '../src/services/oracle-pool.js';
import oracledb from 'oracledb';
import dotenv from 'dotenv';

dotenv.config();

async function check() {
  console.log('Connecting...');
  await createPool();
  await withConnection(async (conn) => {
    console.log('\n--- EXT_PRODUCTS Mapping ---');
    const synonyms = await conn.execute(
      `SELECT synonym_name, table_owner, table_name FROM user_synonyms WHERE synonym_name = 'EXT_PRODUCTS'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('Synonym Info:', JSON.stringify(synonyms.rows, null, 2));

    if (synonyms.rows && synonyms.rows.length > 0) {
      const row = synonyms.rows[0] as any;
      const owner = row.TABLE_OWNER;
      const table = row.TABLE_NAME;
      
      console.log(`\n--- Privileges on ${owner}.${table} ---`);
      const privs = await conn.execute(
        `SELECT privilege FROM user_tab_privs WHERE table_name = :tableName AND owner = :tableOwner`,
        { tableName: table, tableOwner: owner },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      console.log('Privileges:', JSON.stringify(privs.rows, null, 2));
    } else {
      console.log('Synonym EXT_PRODUCTS not found for current user.');
      
      // Try searching all accessible synonyms just in case
      const allSyns = await conn.execute(
        `SELECT owner, synonym_name, table_owner, table_name FROM all_synonyms WHERE synonym_name = 'EXT_PRODUCTS'`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      console.log('All Accessible Synonyms:', JSON.stringify(allSyns.rows, null, 2));
    }
  });
}

check().catch(console.error);
