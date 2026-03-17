import { withConnection, createPool } from '../src/services/oracle-pool.js';
import oracledb from 'oracledb';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  await createPool();
  await withConnection(async (conn) => {
    console.log('--- Database Identity ---');
    const user = await conn.execute(`SELECT USER FROM DUAL`);
    console.log('Current User:', user.rows?.[0]?.[0]);

    console.log('\n--- Synonym Search ---');
    const syns = await conn.execute(
      `SELECT owner, synonym_name, table_owner, table_name 
       FROM all_synonyms 
       WHERE synonym_name = 'EXT_PRODUCTS'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('Found Synonyms:', JSON.stringify(syns.rows, null, 2));

    if (syns.rows && syns.rows.length > 0) {
      const row = syns.rows[0] as any;
      console.log(`\n--- Privilege Check on ${row.TABLE_OWNER}.${row.TABLE_NAME} ---`);
      const privs = await conn.execute(
        `SELECT privilege FROM all_tab_privs 
         WHERE table_name = :t AND table_schema = :s`,
        { t: row.TABLE_NAME, s: row.TABLE_OWNER },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      console.log('Privileges:', JSON.stringify(privs.rows, null, 2));
    } else {
      console.log('\n--- Object Search (Direct) ---');
      const objs = await conn.execute(
        `SELECT owner, object_name, object_type 
         FROM all_objects 
         WHERE object_name = 'EXT_PRODUCTS'`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      console.log('Direct Objects:', JSON.stringify(objs.rows, null, 2));
    }
  });
}

run().catch(console.error);
