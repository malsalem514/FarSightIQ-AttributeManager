import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function testLink() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    console.log('📡 Testing MERCH_VCP19QA_LNK accessibility...');
    const res = await conn.execute("SELECT 1 FROM dual@MERCH_VCP19QA_LNK");
    console.log('✅ Connection successful!');
  } catch (e) {
    console.error('❌ Connection failed:', e.message);
  } finally {
    if (conn) await conn.close();
  }
}

testLink();

