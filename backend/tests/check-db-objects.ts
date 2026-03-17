import { withConnection, createPool } from '../src/services/oracle-pool.js';
import dotenv from 'dotenv';

dotenv.config();

async function check() {
  await createPool();
  await withConnection(async (conn) => {
    console.log('\n--- Checking Synonyms ---');
    const synonyms = await conn.execute(
      `SELECT synonym_name, table_owner, table_name, db_link FROM user_synonyms 
       WHERE synonym_name IN ('EXT_PRODUCTS', 'MERCH_EXT_PRODUCT_VARIANTS', 'INTFS_SHOPIFY_PK', 'PK_INTFS_SHOPIFY')`
    );
    console.table(synonyms.rows);

    console.log('\n--- Checking Privileges ---');
    const privs = await conn.execute(
      `SELECT table_name, privilege, grantable FROM user_tab_privs 
       WHERE table_name IN ('EXT_PRODUCTS', 'MERCH_EXT_PRODUCT_VARIANTS', 'INTFS_SHOPIFY_PK', 'PK_INTFS_SHOPIFY')`
    );
    console.table(privs.rows);

    console.log('\n--- Checking Object Existence ---');
    const objects = await conn.execute(
      `SELECT object_name, object_type, status FROM all_objects 
       WHERE object_name IN ('EXT_PRODUCTS', 'MERCH_EXT_PRODUCT_VARIANTS', 'INTFS_SHOPIFY_PK', 'PK_INTFS_SHOPIFY')`
    );
    console.table(objects.rows);
  });
}

check().catch(console.error);
