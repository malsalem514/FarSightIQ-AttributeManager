import oracledb from 'oracledb';
import { config } from '../dist/config.js';
import { SettingsService } from '../dist/services/settings.service.js';
import { createPool } from '../dist/services/oracle-pool.js';

async function backToOci() {
  console.log('🔄 Switching back to OCI...');
  try {
    await createPool(config.oracle);
    const settings = await SettingsService.getInstance();
    await settings.switchEnvironment('OCI', 'ADMIN');
    console.log('✅ Back in OCI.');
  } catch (e) {
    console.error('❌ Failed:', e.message);
  }
}

backToOci();

