/**
 * Run V012 Migration - AI Attribution Results
 * 
 * Pattern: PAT-IDEMPOTENT-BY-DESIGN-01
 * Executes migration SQL and validation against Oracle database
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
    const migrationPath = path.join(__dirname, '../../database/standalone/V012__ai_attribution_results.sql');
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
    console.log('='.repeat(70));
    console.log('EXECUTING MIGRATION');
    console.log('='.repeat(70));
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
        // Special handling for CREATE TABLE
        if (stmt.includes('CREATE TABLE')) {
          const match = stmt.match(/CREATE TABLE\s+(\w+)/i);
          const tableName = match ? match[1] : 'unknown';
          process.stdout.write(`[${i + 1}/${statements.length}] Creating ${tableName}... `);
        } else if (stmt.includes('CREATE INDEX')) {
          const match = stmt.match(/CREATE INDEX\s+(\w+)/i);
          const indexName = match ? match[1] : 'unknown';
          process.stdout.write(`[${i + 1}/${statements.length}] Creating index ${indexName}... `);
        } else if (stmt.includes('COMMENT ON')) {
          process.stdout.write(`[${i + 1}/${statements.length}] Adding comment... `);
        } else {
          process.stdout.write(`[${i + 1}/${statements.length}] ${stmtType}... `);
        }
        
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
            err.message.includes('ORA-02443') ||  // constraint does not exist
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
    console.log('');
    console.log('✅ Migration committed successfully');
    console.log('');
    console.log('📊 Summary:');
    console.log('   Executed:', successCount, 'statements');
    console.log('   Skipped:', skipCount, 'statements');
    console.log('');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    if (connection) {
      await connection.rollback();
      console.log('🔄 Transaction rolled back');
    }
    throw err;
  } finally {
    if (connection) {
      try {
        await connection.close();
        console.log('🔌 Connection closed\n');
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
}

async function runTests() {
  let connection;
  
  try {
    console.log('='.repeat(70));
    console.log('RUNNING TESTS');
    console.log('='.repeat(70));
    console.log('');

    connection = await oracledb.getConnection(config);

    // Test 1: Verify table exists
    console.log('TEST 1: Verify AI_ATTRIBUTION_RESULTS table exists...');
    const tableResult = await connection.execute(
      `SELECT COUNT(*) as CNT FROM user_tables WHERE table_name = 'AI_ATTRIBUTION_RESULTS'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    if (tableResult.rows[0].CNT === 1) {
      console.log('  ✅ AI_ATTRIBUTION_RESULTS exists');
    } else {
      console.log('  ❌ AI_ATTRIBUTION_RESULTS missing');
      throw new Error('Table AI_ATTRIBUTION_RESULTS not found');
    }
    console.log('✅ TEST 1 PASSED\n');

    // Test 2: Verify columns
    console.log('TEST 2: Verify required columns...');
    const requiredColumns = [
      'RESULT_ID', 'BUSINESS_UNIT_ID', 'STYLE_ID', 'COLOR_ID',
      'LONG_STYLE_DESC', 'SHORT_STYLE_DESC', 'COLOR_AI_DESC',
      'ADDITIONAL_ATTRIBUTES', 'LLM_METADATA', 'STATUS'
    ];
    
    for (const colName of requiredColumns) {
      const colResult = await connection.execute(
        `SELECT COUNT(*) as CNT FROM user_tab_columns 
         WHERE table_name = 'AI_ATTRIBUTION_RESULTS' AND column_name = :colName`,
        { colName },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      
      if (colResult.rows[0].CNT === 1) {
        console.log(`  ✅ ${colName}`);
      } else {
        console.log(`  ❌ ${colName} missing`);
        throw new Error(`Column ${colName} not found`);
      }
    }
    console.log('✅ TEST 2 PASSED\n');

    // Test 3: Verify JSON constraints
    console.log('TEST 3: Verify JSON constraints...');
    const jsonConstraints = await connection.execute(
      `SELECT constraint_name, search_condition 
       FROM user_constraints 
       WHERE table_name = 'AI_ATTRIBUTION_RESULTS' 
         AND constraint_type = 'C' 
         AND search_condition LIKE '%IS JSON%'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    if (jsonConstraints.rows.length >= 2) {
      console.log(`  ✅ Found ${jsonConstraints.rows.length} JSON constraints`);
      jsonConstraints.rows.forEach(row => {
        console.log(`     - ${row.CONSTRAINT_NAME}`);
      });
    } else {
      console.log('  ❌ JSON constraints missing or incomplete');
      throw new Error('Expected at least 2 JSON constraints');
    }
    console.log('✅ TEST 3 PASSED\n');

    // Test 4: Test insert and query
    console.log('TEST 4: Test insert and query...');
    
    // Insert test record
    await connection.execute(`
      INSERT INTO AI_ATTRIBUTION_RESULTS (
        BUSINESS_UNIT_ID, STYLE_ID, COLOR_ID,
        LONG_STYLE_DESC, SHORT_STYLE_DESC,
        ADDITIONAL_ATTRIBUTES, LLM_METADATA,
        STATUS, PROCESSED_AT
      ) VALUES (
        65, 'TEST_STYLE_001', '000',
        'Test Long Description',
        'Test Short Description',
        '{"material": "Cotton", "color": "Blue"}',
        '{"model": "gpt-4o-mini", "confidence": "High"}',
        'success', SYSTIMESTAMP
      )
    `);
    
    // Query back
    const queryResult = await connection.execute(
      `SELECT RESULT_ID, STYLE_ID, STATUS, ADDITIONAL_ATTRIBUTES, LLM_METADATA
       FROM AI_ATTRIBUTION_RESULTS
       WHERE STYLE_ID = 'TEST_STYLE_001'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    if (queryResult.rows.length === 1) {
      console.log('  ✅ Insert successful');
      console.log(`     Result ID: ${queryResult.rows[0].RESULT_ID}`);
      console.log(`     Status: ${queryResult.rows[0].STATUS}`);
      
      // Verify JSON parsing
      const attrs = JSON.parse(queryResult.rows[0].ADDITIONAL_ATTRIBUTES);
      const meta = JSON.parse(queryResult.rows[0].LLM_METADATA);
      
      if (attrs.material === 'Cotton' && meta.model === 'gpt-4o-mini') {
        console.log('  ✅ JSON storage and retrieval working');
      } else {
        throw new Error('JSON data mismatch');
      }
    } else {
      throw new Error('Insert test failed');
    }
    
    // Cleanup test data
    await connection.execute(`DELETE FROM AI_ATTRIBUTION_RESULTS WHERE STYLE_ID = 'TEST_STYLE_001'`);
    await connection.commit();
    
    console.log('✅ TEST 4 PASSED\n');

    // Final summary
    console.log('='.repeat(70));
    console.log('ALL TESTS PASSED! ✅');
    console.log('='.repeat(70));
    console.log('');
    console.log('Migration V012 completed successfully.');
    console.log('AI_ATTRIBUTION_RESULTS table is ready for use.');
    console.log('');

  } catch (err) {
    console.error('❌ Test failed:', err.message);
    if (connection) {
      await connection.rollback();
    }
    throw err;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
}

// Main execution
(async () => {
  try {
    await runMigration();
    await runTests();
    console.log('✅ V012 deployment complete!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Update backend API to use AI_ATTRIBUTION_RESULTS');
    console.log('2. Test AI attribute extraction flow end-to-end');
    console.log('3. Verify JSON storage and retrieval in application');
    console.log('');
    process.exit(0);
  } catch (err) {
    console.error('❌ Script failed:', err.message);
    process.exit(1);
  }
})();

