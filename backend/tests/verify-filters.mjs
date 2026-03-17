import oracledb from 'oracledb';
import { productsService } from '../src/services/products.service.js';
import { createPool } from '../src/services/oracle-pool.js';
import { config } from '../src/config.js';
import { SettingsService } from '../src/services/settings.service.js';

async function verifyFilters() {
  console.log('🧪 Verifying Multi-Tenant Filters (Season, Vendor, Date Range)...');

  try {
    await createPool(config.oracle);
    const settings = await SettingsService.getInstance();
    const activeTenant = await settings.getActiveTenantId();
    const buId = 1;

    console.log(`📍 Testing on Tenant: ${activeTenant}, BU: ${buId}\n`);

    // 1. Test Season Filter
    console.log('--- [1/3] Season Filter Test ---');
    const seasonsRes = await productsService.getHierarchy(buId);
    if (seasonsRes.seasons && seasonsRes.seasons.length > 0) {
      const targetSeason = seasonsRes.seasons[0].id;
      console.log(`Testing with Season: ${targetSeason}`);
      const filtered = await productsService.getProducts({ 
        businessUnitId: buId, 
        seasons: [targetSeason],
        limit: 5 
      });
      console.log(`✅ Results: ${filtered.total} styles found for season ${targetSeason}`);
    } else {
      console.log('⚠️ No seasons found to test.');
    }

    // 2. Test Vendor Filter
    console.log('\n--- [2/3] Vendor Filter Test ---');
    const vendorsRes = await productsService.getHierarchy(buId);
    if (vendorsRes.vendors && vendorsRes.vendors.length > 0) {
      const targetVendor = vendorsRes.vendors[0].id;
      console.log(`Testing with Vendor: ${targetVendor}`);
      const filtered = await productsService.getProducts({ 
        businessUnitId: buId, 
        vendors: [targetVendor],
        limit: 5 
      });
      console.log(`✅ Results: ${filtered.total} styles found for vendor ${targetVendor}`);
    } else {
      console.log('⚠️ No vendors found to test.');
    }

    // 3. Test Date Range Filter
    console.log('\n--- [3/3] Date Range Test ---');
    const dateRanges = ['7d', '30d', '90d'];
    for (const range of dateRanges) {
      const filtered = await productsService.getProducts({ 
        businessUnitId: buId, 
        dateRange: range,
        limit: 5 
      });
      console.log(`✅ Results for ${range}: ${filtered.total} styles found.`);
    }

    console.log('\n✨ Filter Verification Complete.');

  } catch (err) {
    console.error('\n❌ Filter Verification FAILED:', err.message);
    process.exit(1);
  }
}

verifyFilters();

