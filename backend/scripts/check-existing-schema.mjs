/**
 * Check existing schema in attr_mgr database
 * Lists all tables to understand what's already deployed
 */

import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function checkExistingSchema() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: 'attr_mgr',
      password: 'attr_mgr_dev',
      connectString: 'localhost:1521/FREEPDB1',
      connectionTimeout: 10000
    });

    console.log('✅ Connected to attr_mgr schema\n');
    console.log('='.repeat(80));
    console.log('EXISTING TABLES');
    console.log('='.repeat(80));
    console.log('');

    // List all tables
    const tables = await conn.execute(`
      SELECT table_name, num_rows, last_analyzed
      FROM user_tables
      ORDER BY table_name
    `);

    if (tables.rows.length > 0) {
      console.log(`Found ${tables.rows.length} tables:\n`);
      tables.rows.forEach((row, idx) => {
        console.log(`${(idx + 1).toString().padStart(2, ' ')}. ${row.TABLE_NAME.padEnd(40, ' ')} Rows: ${row.NUM_ROWS || 'unknown'}`);
      });
    } else {
      console.log('No tables found');
    }

    console.log('\n' + '='.repeat(80));
    console.log('ATTRIBUTE MANAGER TABLES (from our design)');
    console.log('='.repeat(80));
    console.log('');

    const ourTables = [
      'ATTRIBUTE_GROUPS',
      'CHARACTERISTIC_TYPE_GROUPS',
      'CHARACTERISTIC_HIERARCHY_RULES',
      'STYLE_CHARACTERISTIC_VALUES',
      'LLM_CHAR_MAPPINGS',
      'AI_ATTRIBUTION_RESULTS',
      'HIERARCHY_CACHE'
    ];

    for (const tableName of ourTables) {
      const exists = tables.rows.find(r => r.TABLE_NAME === tableName);
      if (exists) {
        console.log(`✅ ${tableName.padEnd(40, ' ')} EXISTS (${exists.NUM_ROWS || 0} rows)`);
        
        // Show columns
        const cols = await conn.execute(`
          SELECT column_name, data_type, nullable
          FROM user_tab_columns
          WHERE table_name = :tableName
          ORDER BY column_id
        `, { tableName });
        
        console.log(`   Columns: ${cols.rows.length}`);
        cols.rows.slice(0, 5).forEach(col => {
          console.log(`     - ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
        });
        if (cols.rows.length > 5) {
          console.log(`     ... and ${cols.rows.length - 5} more`);
        }
        console.log('');
      } else {
        console.log(`❌ ${tableName.padEnd(40, ' ')} MISSING`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('PACKAGES');
    console.log('='.repeat(80));
    console.log('');

    const packages = await conn.execute(`
      SELECT object_name, object_type, status
      FROM user_objects
      WHERE object_type IN ('PACKAGE', 'PACKAGE BODY')
      ORDER BY object_name, object_type
    `);

    if (packages.rows.length > 0) {
      const pkgMap = {};
      packages.rows.forEach(row => {
        if (!pkgMap[row.OBJECT_NAME]) {
          pkgMap[row.OBJECT_NAME] = { spec: null, body: null };
        }
        if (row.OBJECT_TYPE === 'PACKAGE') {
          pkgMap[row.OBJECT_NAME].spec = row.STATUS;
        } else {
          pkgMap[row.OBJECT_NAME].body = row.STATUS;
        }
      });

      Object.keys(pkgMap).forEach(name => {
        const spec = pkgMap[name].spec ? `✅ ${pkgMap[name].spec}` : '❌ MISSING';
        const body = pkgMap[name].body ? `✅ ${pkgMap[name].body}` : '❌ MISSING';
        console.log(`${name.padEnd(30, ' ')} Spec: ${spec.padEnd(15, ' ')} Body: ${body}`);
      });
    } else {
      console.log('No packages found');
    }

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    if (conn) {
      await conn.close();
      console.log('\n✅ Connection closed');
    }
  }
}

checkExistingSchema().catch(console.error);

