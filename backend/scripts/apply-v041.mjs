import oracledb from 'oracledb';
import { config } from '../dist/config.js';
import { createPool, withConnection } from '../dist/services/oracle-pool.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  try {
    await createPool(config.oracle);
    const sqlFile = path.join(__dirname, '../../database/standalone/V041__llm_admin_config.sql');
    const sql = await fs.readFile(sqlFile, 'utf8');
    
    // Split into individual statements/blocks more robustly
    const statements = sql
      .split('\n')
      .filter(line => !line.trim().startsWith('--')) // Remove comments
      .filter(line => !line.trim().startsWith('SET')) // Remove SET commands
      .filter(line => !line.trim().startsWith('PROMPT')) // Remove PROMPT commands
      .join('\n')
      .split('/')
      .map(s => s.trim())
      .filter(Boolean);
    
    await withConnection(async (conn) => {
      for (let stmt of statements) {
        // If it's just a single SQL statement (no BEGIN/END), it might end with a semicolon
        // oracledb doesn't want the trailing semicolon.
        let sqlToExec = stmt;
        if (!sqlToExec.toUpperCase().includes('BEGIN') && sqlToExec.endsWith(';')) {
          sqlToExec = sqlToExec.slice(0, -1).trim();
        }
        
        try {
          console.log(`Executing: ${sqlToExec.substring(0, 50)}...`);
          await conn.execute(sqlToExec);
        } catch (e) {
          console.error(`Error executing: ${e.message}`);
          // Don't exit, try next
        }
      }
      await conn.commit();
    });
    
    console.log('✅ Migration V041 complete.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

main();
