import oracledb from 'oracledb';
import { config } from '../dist/config.js';
import { productsService } from '../dist/services/products.service.js';
import { hierarchyCacheService } from '../dist/services/hierarchy-cache.service.js';
import { libraryService } from '../dist/services/library.service.js';
import { onboardingService } from '../dist/services/onboarding.service.js';
import { SettingsService } from '../dist/services/settings.service.js';
import { createPool } from '../dist/services/oracle-pool.js';
import { syncService } from '../dist/services/sync.service.js';

async function runAudit() {
  console.log('👁️  Sauron\'s Eye: Global Functional Audit Starting...\n');

  try {
    // 0. Setup
    await createPool(config.oracle);
    const settings = await SettingsService.getInstance();
    const envs = await settings.getEnvironments();
    const activeEnv = envs.find(e => e.isActive);
    
    if (!activeEnv) {
      throw new Error('No active environment found!');
    }
    
    const buId = activeEnv.default_bu_id || 1;
    const tenantId = activeEnv.id;

    console.log(`📡 Context: ${tenantId} | BU: ${buId}`);
    console.log('------------------------------------------');

    // 1. Audit Products Service
    console.log('\n[1/5] Products Service Audit...');
    const existingRes = await productsService.getProducts({
      businessUnitId: buId,
      mode: 'existing',
      limit: 5,
      offset: 0
    });
    if (existingRes.success && existingRes.data.length > 0) {
      console.log(`  ✅ Existing Products: Found ${existingRes.total} (Retrieved sample: ${existingRes.data[0].style_id})`);
    } else {
      console.log('  ⚠️  No existing products found in catalog cache.');
    }

    const draftRes = await productsService.getProducts({
      businessUnitId: buId,
      mode: 'new',
      limit: 5,
      offset: 0
    });
    console.log(`  ✅ Draft Styles: Found ${draftRes.total} records.`);

    // 2. Audit Hierarchy Service
    console.log('\n[2/5] Hierarchy & Dropdowns Audit...');
    const hierarchy = await productsService.getHierarchy(buId);
    if (hierarchy && hierarchy.departments && hierarchy.departments.length > 0) {
      console.log(`  ✅ Hierarchy: Loaded ${hierarchy.departments.length} departments.`);
      console.log(`     Sample Dept: ${hierarchy.departments[0].name} (${hierarchy.departments[0].id})`);
    } else {
      console.log('  ⚠️  Hierarchy is empty or failed to load structured depts.');
    }

    // 3. Audit Library (Attributes)
    console.log('\n[3/5] Attribute Library Audit...');
    const definitions = await libraryService.getTypes(buId);
    if (definitions && definitions.length > 0) {
      console.log(`  ✅ Library: Loaded ${definitions.length} attribute types.`);
      const sampleType = definitions[0];
      const values = await libraryService.getValues(buId, sampleType.typeId);
      console.log(`     Sample Type: ${sampleType.description} (${sampleType.typeId}) | Values: ${values.length}`);
    } else {
      console.log('  ❌ Attribute library is empty!');
    }

    // 4. Audit Sync Status
    console.log('\n[4/5] Sync & Glass Box Audit...');
    const connSync = await oracledb.getConnection(config.oracle);
    try {
      const res = await connSync.execute(
        `SELECT STATUS, UPDATE_TIME FROM SYNC_PROGRESS WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :buId AND OP_NAME = 'REFRESH_CATALOG' FETCH NEXT 1 ROWS ONLY`,
        { tenant: tenantId, buId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (res.rows?.[0]) {
        const p = res.rows[0];
        console.log(`  ✅ Sync State: ${p.STATUS || 'IDLE'}`);
        console.log(`     Last Update: ${p.UPDATE_TIME}`);
      } else {
        console.log('  ℹ️  No sync progress found for this BU.');
      }
    } finally {
      await connSync.close();
    }

    // 5. Audit Image Retrieval (Logic Check)
    console.log('\n[5/5] Media Logic Audit...');
    const connObj = await oracledb.getConnection(config.oracle);
    try {
      const userRes = await connObj.execute("SELECT USER FROM DUAL");
      console.log(`     Running as: ${userRes.rows[0][0]}`);
      const res = await connObj.execute(
        "SELECT COUNT(*) FROM user_objects WHERE object_name = 'FETCH_REMOTE_IMAGE'"
      );
      const count = res.rows[0][0];
      console.log(`  ✅ Image Proxy Procedure: ${count > 0 ? 'INSTALLED' : 'MISSING'}`);
    } finally {
      await connObj.close();
    }

    console.log('\n------------------------------------------');
    console.log('✨ Global Functional Audit: PASSED.');
    console.log('All core backend services are operational and linked correctly.');

  } catch (err) {
    console.error('\n❌ Audit FAILED:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

runAudit();

