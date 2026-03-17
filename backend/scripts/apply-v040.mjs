import oracledb from 'oracledb';
import { config } from '../dist/config.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function apply() {
  let conn;
  try {
    console.log('🚀 Applying Architecture Hardening (V040)...');
    conn = await oracledb.getConnection(config.oracle);
    
    const sqlFile = path.join(__dirname, '../../database/standalone/V040__architecture_hardening.sql');
    const content = await fs.readFile(sqlFile, 'utf8');
    
    // Split by / on a line by itself
    const statements = content.split(/\r?\n\/\s*(\r?\n|$)/);
    
    for (let sql of statements) {
      if (!sql) continue;
      sql = sql.trim();
      if (!sql || sql.startsWith('PROMPT') || sql.startsWith('SET')) continue;
      
      try {
        await conn.execute(sql);
        console.log('✅ Executed block');
      } catch (e) {
        console.error('❌ Failed block:', e.message);
        console.error('SQL:', sql.substring(0, 100) + '...');
      }
    }
    
    await conn.commit();
    console.log('\n✨ Architecture Hardening Applied Successfully.');

  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

apply();

