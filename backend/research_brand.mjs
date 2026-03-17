import oracledb from 'oracledb';
import { config } from './dist/config.js';
import { createPool, withConnection } from './dist/services/oracle-pool.js';

async function researchBrand() {
  await createPool(config.oracle);
  
  await withConnection(async (conn) => {
    console.log('--- Table Structure ---');
    const res = await conn.execute(`
      SELECT column_name, data_type, data_length 
      FROM all_tab_columns 
      WHERE table_name = 'CATALOG_CACHE_SHADOW' 
      ORDER BY column_id
    `);
    console.table(res.rows);

    console.log('\n--- Brand Sample Data (OCI) ---');
    const brandRes = await conn.execute(`
      SELECT BRAND_NAME, COUNT(*) 
      FROM ATTR_MGR.CATALOG_CACHE_SHADOW 
      WHERE TENANT_ID = 'OCI'
      GROUP BY BRAND_NAME 
      ORDER BY 2 DESC 
      FETCH NEXT 10 ROWS ONLY
    `);
    console.table(brandRes.rows);

    console.log('\n--- Probing STYLES for high-value dimensions ---');
    const probeCols = ['GENDER', 'COLLECTION', 'FABRIC', 'FIT', 'ITEM_TYPE', 'PRODUCT_TYPE', 'LIFESTYLE', 'TARGET_MARKET', 'AGE_GROUP'];
    const results = [];
    
    for (const col of probeCols) {
      try {
        const res = await conn.execute(`SELECT ${col}, COUNT(*) FROM STYLES WHERE ROWNUM <= 1000 GROUP BY ${col} FETCH NEXT 1 ROWS ONLY`);
        results.push({ column: col, status: 'PRESENT', sample: res.rows[0]?.[0] || 'NULL' });
      } catch (e) {
        results.push({ column: col, status: 'MISSING', sample: 'N/A' });
      }
    }
    console.table(results);
  });
}

researchBrand().catch(console.error);

