import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function addVcp19qa() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    console.log('🚀 Adding VCP19QA Environment...');

    // 1. Create DB Link
    const linkName = 'MERCH_VCP19QA_LNK';
    const tns = '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=srv-db-101.jestais.local)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=VCP19QA)))';
    
    try { 
      await conn.execute(`DROP DATABASE LINK ${linkName}`); 
      console.log(`  ℹ️  Dropped existing ${linkName}`);
    } catch(e) {}
    
    await conn.execute(
      `CREATE DATABASE LINK ${linkName} CONNECT TO merch IDENTIFIED BY cmcs12 USING '${tns}'`
    );
    console.log(`✅ Created DB Link: ${linkName}`);

    // 2. Add to APP_ENVIRONMENTS
    // We use a unique ID 'VCP19QA'
    await conn.execute(
      `MERGE INTO APP_ENVIRONMENTS t
       USING (
         SELECT 'VCP19QA' as env_id, 
                'VCP19QA (QA Server)' as env_name, 
                '${linkName}' as db_link_name, 
                1 as default_bu_id, 
                'QA' as env_type,
                '/images/' as image_base_url
         FROM DUAL
       ) s ON (t.env_id = s.env_id)
       WHEN MATCHED THEN 
         UPDATE SET env_name = s.env_name, db_link_name = s.db_link_name, default_bu_id = s.default_bu_id, env_type = s.env_type
       WHEN NOT MATCHED THEN
         INSERT (env_id, env_name, db_link_name, default_bu_id, env_type, image_base_url)
         VALUES (s.env_id, s.env_name, s.db_link_name, s.default_bu_id, s.env_type, s.image_base_url)`
    );
    console.log('✅ Added VCP19QA to APP_ENVIRONMENTS');

    await conn.commit();
    console.log('\n✨ VCP19QA environment added successfully.');

  } catch (e) {
    console.error('❌ Failed to add environment:', e.message);
  } finally {
    if (conn) await conn.close();
  }
}

addVcp19qa();

