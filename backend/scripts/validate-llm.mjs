import { createPool, withConnection } from '../dist/services/oracle-pool.js';
import { config } from '../dist/config.js';
import { llmConfigService } from '../dist/services/llm-config.service.js';
import { attributesService } from '../dist/services/attributes.service.js';
import { logger } from '../dist/utils/logger.js';

async function validate() {
  try {
    await createPool(config.oracle);
    console.log('✅ Oracle Pool Initialized');

    // 1. Check DB Configs
    const configs = await llmConfigService.getAllConfigs();
    console.log('Current LLM Configs in DB:', JSON.stringify(configs, null, 2));

    const active = configs.find(c => c.isActive);
    console.log(`Active Provider in DB: ${active?.providerId || 'NONE'}`);

    // 2. Test Provider Factory through AttributesService
    console.log('\n--- Testing Provider Factory ---');
    try {
        const health = await attributesService.healthCheck();
        console.log(`Current Provider Health: ${health ? 'PASS' : 'FAIL'}`);
    } catch (e) {
        console.log(`Current Provider Health Error (Expected if key missing): ${e.message}`);
    }

    // 3. Test Switching to Gemini (Mocking the UI/API call)
    console.log('\n--- Testing Provider Switching ---');
    await llmConfigService.updateConfig({ providerId: 'gemini', isActive: true });
    const configsAfterSwitch = await llmConfigService.getAllConfigs();
    const activeAfterSwitch = configsAfterSwitch.find(c => c.isActive);
    console.log(`New Active Provider: ${activeAfterSwitch?.providerId}`);

    // 4. Test Gemini Extraction Attempt
    console.log('\n--- Testing Gemini Extraction Attempt ---');
    try {
        // This will likely fail with 401 but confirms the provider is being used
        await attributesService.extractFromBase64(1, 'fake_base64');
    } catch (e) {
        console.log(`Gemini Extraction Result: ${e.message}`);
        if (e.message.includes('Gemini') || e.message.includes('google')) {
            console.log('✅ Success: AttributesService is correctly using Gemini provider after switch.');
        }
    }

    // 5. Cleanup: Switch back to OpenAI
    await llmConfigService.updateConfig({ providerId: 'openai', isActive: true });
    console.log('\n✅ Switched back to OpenAI');

  } catch (err) {
    console.error('❌ Validation failed:', err);
  } finally {
    process.exit(0);
  }
}

validate();

