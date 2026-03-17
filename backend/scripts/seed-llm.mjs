import { createPool, withConnection } from '../dist/services/oracle-pool.js';
import { config } from '../dist/config.js';

async function seed() {
  try {
    await createPool(config.oracle);
    await withConnection(async (conn) => {
      // Clean up if anything exists
      await conn.execute('DELETE FROM ATTR_MGR.LLM_CONFIG');
      
      await conn.execute(
        "INSERT INTO ATTR_MGR.LLM_CONFIG (PROVIDER_ID, IS_ACTIVE, MODEL_NAME) VALUES ('openai', 'Y', 'gpt-4o-mini')"
      );
      await conn.execute(
        "INSERT INTO ATTR_MGR.LLM_CONFIG (PROVIDER_ID, IS_ACTIVE, MODEL_NAME) VALUES ('gemini', 'N', 'gemini-3-flash')"
      );
      await conn.commit();
      console.log('✅ LLM_CONFIG seeded successfully');
    });
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
  } finally {
    process.exit(0);
  }
}

seed();

