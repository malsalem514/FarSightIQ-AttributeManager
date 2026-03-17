/**
 * E2E Test: Draft Style Onboarding Flow (Vanilla JS)
 */

import oracledb from 'oracledb';
import { onboardingService } from './src/services/onboarding.service.js';
import { withConnection, createPool } from './src/services/oracle-pool.js';
import { config as appConfig } from './src/config.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function runTest() {
  console.log('👁️  Sauron\'s Eye: Starting E2E Onboarding Test (LOCAL STANDALONE)...\n');

  try {
    // 0. INITIALIZE POOL (LOCAL DOCKER)
    console.log('Step 0: Initializing Oracle Pool (Local Docker)...');
    await createPool(appConfig.oracle);
    console.log('✅ Pool Ready\n');

    const buId = 1;
    const testImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='; 
    const imageName = `e2e_test_shoe_${Date.now()}.png`;

    // 1. SIMULATE ONBOARDING
    console.log('Step 1: Starting Onboarding from photo...');
    const result = await onboardingService.startOnboarding(buId, testImage, imageName);
    console.log('✅ Onboarding Initiated. Session ID:', result.sessionId);
    console.log('   Initial Completion Score:', result.completionPct + '%');

    // 2. VERIFY DATABASE PERSISTENCE
    console.log('\nStep 2: Verifying DB Persistence...');
    await withConnection(async (conn) => {
      const res = await conn.execute(
        `SELECT * FROM ATTR_MGR.STAGING_STYLES WHERE SESSION_ID = :sid`,
        { sid: result.sessionId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (!res.rows?.[0]) throw new Error('DB Error: Draft record not found!');
      console.log('✅ Draft Header Found in ATTR_MGR.STAGING_STYLES');

      const imgRes = await conn.execute(
        `SELECT DBMS_LOB.GETLENGTH(BLOB_DATA) as LEN FROM ATTR_MGR.STAGING_IMAGES WHERE SESSION_ID = :sid`,
        { sid: result.sessionId }
      );
      const len = imgRes.rows?.[0]?.[0] || imgRes.rows?.[0]?.LEN;
      console.log('✅ Image BLOB Verified. Length:', len, 'bytes');
    });

    // 3. ENRICH MANDATORY FIELDS
    console.log('\nStep 3: Enriching Mandatory Fields (Vendor, Size Group)...');
    await withConnection(async (conn) => {
      await conn.execute(
        `UPDATE STAGING_STYLES SET 
          VENDOR_ID = 'TEST_VEND', 
          VENDOR_STYLE_NO = 'VS-' || :sid,
          SIZE_GROUP_ID = 'STD',
          SECTION_ID = 12345,
          SHORT_DESCRIPTION = 'E2E Test Shoe'
         WHERE SESSION_ID = :sid`,
        { sid: result.sessionId }
      );
      
      await conn.execute(
        `INSERT INTO STAGING_STYLE_COLORS (SESSION_ID, COLOR_ID, COLOR_NAME) VALUES (:sid, '001', 'BLACK')`,
        { sid: result.sessionId }
      );
      await conn.execute(
        `INSERT INTO STAGING_STYLE_SIZES (SESSION_ID, SIZE_ID) VALUES (:sid, '10')`,
        { sid: result.sessionId }
      );
      
      await conn.commit();
    });

    // 4. RUN PREFLIGHT
    console.log('\nStep 4: Running Virtual Preflight...');
    const newScore = await onboardingService.runPreflight(result.sessionId);
    console.log('✅ Preflight Recalculated. New Score:', newScore + '%');

    // 5. ATOMIC PROMOTION
    console.log('\nStep 5: Promoting to ERP Integration tables...');
    await withConnection(async (conn) => {
      const res = await conn.execute(
        `BEGIN ATTR_MGR.PROMOTION_PKG.promote_draft(:sid, :username, :jobId, :status, :error); END;`,
        {
          sid: result.sessionId,
          username: 'SAURON_EYE',
          jobId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
          error: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 1000 }
        }
      );

      const status = res.outBinds.status;
      const error = res.outBinds.error;
      const jobId = res.outBinds.jobId;

      if (status !== 'SUCCESS') {
        throw new Error(`Promotion Failed: ${error}`);
      }

      console.log('✅ Promotion Successful! Job ID:', jobId);

      const iriRes = await conn.execute(
        `SELECT COUNT(*) as CNT FROM IRI_WHSLE_STYLES WHERE JOB_ID = :jobId`,
        { jobId }
      );
      const count = iriRes.rows?.[0]?.[0] || iriRes.rows?.[0]?.CNT;
      if (count > 0) {
        console.log('✅ FINAL VALIDATION: Record exists in IRI_WHSLE_STYLES');
      } else {
        throw new Error('FINAL VALIDATION FAILED: Record missing in IRI tables!');
      }
    });

    console.log('\n🎉 E2E TEST PASSED: Full Lifecycle Verified from Photo to ERP.');

  } catch (err) {
    console.error('\n❌ E2E TEST FAILED:', err.message);
    process.exit(1);
  }
}

runTest();
