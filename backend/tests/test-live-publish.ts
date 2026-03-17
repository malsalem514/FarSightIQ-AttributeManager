import { shopifyService } from '../src/services/shopify.service.js';
import { shopifyMediaService } from '../src/services/shopify-media.service.js';
import { createPool } from '../src/services/oracle-pool.js';
import { logger } from '../src/utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

async function testLiveSync() {
  // 0. Initialize Pool
  console.log(`\n[0/3] Initializing Oracle Pool...`);
  await createPool();
  console.log(`✅ Oracle Pool initialized`);
  const businessUnitId = 1;
  const styleId = '1000019'; // Using the known demo style
  const bannerId = 'SHOPIFY_DEMO';

  console.log(`\n🚀 STARTING END-TO-END SYNC TEST`);
  console.log(`---------------------------------`);
  console.log(`Style: ${styleId}`);
  console.log(`Banner: ${bannerId}`);

  try {
    // 1. Trigger Publish (Real MERGE into EXT_PRODUCTS)
    console.log(`\n[1/3] Triggering Publication...`);
    await shopifyService.toggleProductStatus({ 
      businessUnitId, 
      styleId, 
      bannerId, 
      publish: true 
    });
    console.log(`✅ Style ${styleId} merged into EXT_PRODUCTS`);

    // 2. Trigger Inventory Sync (Real call to INTFS_SHOPIFY_PK)
    console.log(`\n[2/3] Triggering Inventory Sync...`);
    await shopifyService.syncInventory({ 
      businessUnitId, 
      styleId, 
      bannerId 
    });
    console.log(`✅ INTFS_SHOPIFY_PK.sync_inventory executed`);

    // 3. Trigger Media Sync (Real Staged Upload workflow)
    console.log(`\n[3/3] Triggering Media Sync...`);
    const mediaResult = await shopifyMediaService.syncProductMedia(
      businessUnitId, 
      styleId, 
      bannerId
    );
    
    if (mediaResult.success) {
      console.log(`✅ Media sync successful: ${mediaResult.syncedCount} images pushed`);
    } else {
      console.log(`⚠️ Media sync partially failed:`, mediaResult.errors);
    }

    console.log(`\n---------------------------------`);
    console.log(`🏁 TEST COMPLETED`);

  } catch (error: any) {
    console.error(`\n❌ TEST FAILED:`, error.message);
    process.exit(1);
  }
}

testLiveSync();
