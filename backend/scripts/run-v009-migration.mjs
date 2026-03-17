/**
 * Run V009 Migration - Migrate Existing Attributes
 * 
 * Pattern: PAT-IDEMPOTENT-BY-DESIGN-01
 * Executes data migration SQL against Oracle database
 */

import oracledb from 'oracledb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1',
  connectionTimeout: 30000,
};

async function runMigration() {
  let connection;
  
  try {
    console.log('🔌 Connecting to Oracle database...');
    connection = await oracledb.getConnection(config);
    console.log('✅ Connected successfully\n');

    // Read migration SQL
    const migrationPath = path.join(__dirname, '../../database/standalone/V009__migrate_existing_attributes.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log('📄 Migration file loaded:', migrationPath);
    console.log('📊 File size:', Math.round(migrationSql.length / 1024), 'KB\n');

    // Split SQL into statements
    const statements = [];
    let currentStatement = '';
    let inPlsqlBlock = false;
    
    const lines = migrationSql.split('\n');
    for (const line of lines) {
      // Skip comments and prompts
      if (line.trim().startsWith('--') || 
          line.trim().startsWith('PROMPT') || 
          line.trim().startsWith('SET ') ||
          line.trim() === '') {
        continue;
      }
      
      // Detect PL/SQL block start
      if (line.trim().match(/^(BEGIN|DECLARE)/i)) {
        inPlsqlBlock = true;
      }
      
      // Detect PL/SQL block end (forward slash on its own line)
      if (inPlsqlBlock && line.trim() === '/') {
        statements.push(currentStatement.trim());
        currentStatement = '';
        inPlsqlBlock = false;
        continue;
      }
      
      currentStatement += line + '\n';
      
      // Regular statement end (semicolon)
      if (!inPlsqlBlock && line.trim().endsWith(';')) {
        statements.push(currentStatement.trim());
        currentStatement = '';
      }
    }
    
    console.log('🔢 Found', statements.length, 'SQL statements to execute\n');
    console.log('=' .repeat(70));
    console.log('EXECUTING MIGRATION');
    console.log('=' .repeat(70));
    console.log('');

    // Execute statements
    let successCount = 0;
    let skipCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      let stmt = statements[i];
      
      // Skip empty statements
      if (!stmt || stmt.trim() === '/') {
        continue;
      }
      
      // For DDL statements: strip comments and remove trailing semicolon
      if (!stmt.trim().match(/^(BEGIN|DECLARE)/i)) {
        stmt = stmt.split('\n')
          .map(line => {
            const commentIdx = line.indexOf('--');
            return commentIdx >= 0 ? line.substring(0, commentIdx) : line;
          })
          .join('\n')
          .trim()
          .replace(/;$/, '');
      }
      
      // Extract statement type for logging
      const stmtType = stmt.trim().split(/\s+/)[0].toUpperCase();
      
      try {
        process.stdout.write(`[${i + 1}/${statements.length}] ${stmtType}... `);
        
        await connection.execute(stmt, [], { autoCommit: false });
        console.log('✅');
        successCount++;
        
      } catch (err) {
        // Check if error is "already exists" or "does not exist" (safe to skip)
        if (err.message.includes('ORA-00955') ||  // name already used
            err.message.includes('ORA-00942') ||  // table does not exist
            err.message.includes('ORA-01408') ||  // column list already indexed
            err.message.includes('ORA-01430') ||  // column already exists
            err.message.includes('ORA-02264') ||  // constraint already exists
            err.message.includes('ORA-02444')) {  // FK references remote/unavailable object
          console.log('⏭️  (already exists/handled)');
          skipCount++;
        } else {
          console.log('❌');
          console.error('Error:', err.message);
          console.error('Statement:', stmt.substring(0, 200) + '...');
          throw err;
        }
      }
    }

    // Commit transaction
    await connection.commit();
    console.log('\n✅ Migration committed successfully\n');
    console.log('📊 Summary:');
    console.log('   Executed:', successCount, 'statements');
    console.log('   Skipped:', skipCount, 'statements\n');

  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    if (connection) {
      console.log('🔄 Transaction rolled back');
      await connection.rollback();
    }
    throw err;
  } finally {
    if (connection) {
      await connection.close();
      console.log('🔌 Connection closed\n');
    }
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('✅ V009 migration completed successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Script failed:', err.message);
    process.exit(1);
  });

