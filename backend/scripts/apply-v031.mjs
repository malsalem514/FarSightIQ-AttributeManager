/**
 * Apply Migration V031: Promotion Package
 */

import oracledb from 'oracledb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend directory
dotenv.config({ path: path.join(__dirname, '../.env') });

const config = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1',
  connectionTimeout: 30000,
  queryTimeout: 60000
};

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function executeSqlFile(connection, filePath) {
  console.log(`\n📄 Applying: ${path.basename(filePath)}`);
  const sql = fs.readFileSync(filePath, 'utf-8');
  const lines = sql.split('\n');
  let currentBlock = [];
  let blocks = [];

  for (let line of lines) {
    const trimmed = line.trim();
    const upper = trimmed.toUpperCase();
    if (!trimmed || trimmed.startsWith('--') || upper.startsWith('PROMPT') || upper.startsWith('SET ')) continue;
    if (trimmed === '/') {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
      }
      continue;
    }
    currentBlock.push(line);
  }
  if (currentBlock.length > 0) blocks.push(currentBlock.join('\n'));

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;
    try {
      console.log(`  [${i + 1}/${blocks.length}] Executing block...`);
      await connection.execute(block);
      await connection.commit();
      console.log(`  ✅ Success`);
    } catch (err) {
      console.error(`  ❌ Failed block:\n${block}\n`);
      throw err;
    }
  }
}

async function main() {
  let connection;
  try {
    connection = await oracledb.getConnection(config);
    console.log('✅ Connected\n');
    const migrationPath = path.join(__dirname, '../../database/standalone/V031__promotion_package.sql');
    await executeSqlFile(connection, migrationPath);
    console.log('\n🎉 V031 Migration Complete!\n');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.close();
  }
}

main();

