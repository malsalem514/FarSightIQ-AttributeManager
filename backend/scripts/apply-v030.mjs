/**
 * Apply Migration V030: Unified Authoring & Draft System
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

// Oracle connection config - LOCAL DOCKER DATABASE
const config = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1',
  connectionTimeout: 30000,
  queryTimeout: 60000
};

console.log('Applying Migration to LOCAL DOCKER Oracle:', {
  user: config.user,
  connectString: config.connectString
});

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

/**
 * Execute SQL file
 */
async function executeSqlFile(connection, filePath) {
  console.log(`\n📄 Applying: ${path.basename(filePath)}`);
  
  const sql = fs.readFileSync(filePath, 'utf-8');
  
  // Clean SQL: remove PROMPT, SET, and SQL*Plus formatting
  // BUT keep the content of BEGIN...END blocks
  const lines = sql.split('\n');
  let currentBlock = [];
  let blocks = [];
  let inPlsql = false;

  for (let line of lines) {
    const trimmed = line.trim();
    const upper = trimmed.toUpperCase();

    // Skip SQL*Plus specific lines
    if (!trimmed || 
        trimmed.startsWith('--') || 
        upper.startsWith('PROMPT') || 
        upper.startsWith('SET ') || 
        upper.startsWith('SHOW ')) {
      continue;
    }

    if (trimmed === '/') {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
      }
      continue;
    }

    currentBlock.push(line);
  }

  // Handle any remaining block if no trailing /
  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'));
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;

    try {
      const preview = block.substring(0, 50).replace(/\s+/g, ' ');
      console.log(`  [${i + 1}/${blocks.length}] Executing: ${preview}...`);
      await connection.execute(block);
      await connection.commit();
      console.log(`  ✅ Success`);
    } catch (err) {
      if (err.message.includes('ORA-00955')) {
        console.log(`  ⚠️  Object already exists, skipping.`);
      } else {
        console.error(`  ❌ Failed block:\n${block}\n`);
        throw err;
      }
    }
  }
}

async function main() {
  let connection;
  try {
    connection = await oracledb.getConnection(config);
    console.log('✅ Connected\n');

    const migrationPath = path.join(__dirname, '../../database/standalone/V030__draft_authoring_system.sql');
    await executeSqlFile(connection, migrationPath);

    console.log('\n📊 Verifying V030 Objects:\n');
    const result = await connection.execute(`
      SELECT object_name, object_type, status 
      FROM user_objects 
      WHERE object_name IN (
        'STAGING_STYLES', 'STAGING_STYLE_COLORS', 'STAGING_STYLE_SIZES', 
        'STAGING_STYLE_CHARACTERISTICS', 'STAGING_IMAGES'
      )
      ORDER BY object_type, object_name
    `);
    
    console.table(result.rows);
    console.log('\n🎉 V030 Migration Complete!\n');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

main();
