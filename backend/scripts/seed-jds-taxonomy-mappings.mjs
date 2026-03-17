#!/usr/bin/env node
/**
 * Seed JDS_MPRD Taxonomy Mappings
 * 
 * Auto-maps JDS_MPRD departments to Shopify taxonomy categories
 * and seeds attribute hierarchy rules for governance.
 */

import oracledb from 'oracledb';

const DB_CONFIG = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1'
};

// Mapping: JDS department IDs → Shopify category IDs
const DEPT_TO_SHOPIFY = {
  // Men's
  'MNAP': 'aa-1-1-1',   // Apparel > Men's Clothing
  'MNFT': 'sg-5-18',    // Sporting Goods > Footwear > Men's Athletic Shoes
  
  // Women's
  'WNAP': 'aa-1-1-2',   // Apparel > Women's Clothing  
  'WMFT': 'sg-5-19',    // Sporting Goods > Footwear > Women's Athletic Shoes
  
  // Kids/Infants
  'CHAP': 'aa-1-1-3',   // Apparel > Children's Clothing
  'CHFT': 'sg-5-8',     // Sporting Goods > Footwear > Children's Athletic Shoes
  'INAP': 'aa-1-1-4',   // Apparel > Baby & Toddler Clothing
  'INFT': 'sg-5-1',     // Baby Footwear
  'JNAP': 'aa-1-1-5',   // Junior Apparel (Teen)
  'JNFT': 'sg-5-17',    // Junior Footwear
  
  // Accessories
  'CLAC': 'aa-2',       // Apparel > Clothing Accessories
  'OTAC': 'aa-4',       // Apparel > Handbag & Wallet Accessories
  
  // Utility
  'UTIL': 'aa-3'        // Costumes & Accessories (catch-all)
};

async function main() {
  let connection;
  try {
    console.log('🔗 Connecting to Oracle...');
    connection = await oracledb.getConnection(DB_CONFIG);

    const tenantId = 'JDS_MPRD';
    const businessUnitId = 1;
    const versionTag = 'v1';

    // 1. Get current departments from hierarchy cache
    console.log('\n📋 Fetching JDS_MPRD departments...');
    const deptResult = await connection.execute(
      `SELECT DISTINCT dept_id, dept_name 
       FROM ATTR_MGR.HIERARCHY_CACHE 
       WHERE tenant_id = :tenant AND business_unit_id = :bu
       ORDER BY dept_id`,
      { tenant: tenantId, bu: businessUnitId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    console.log(`   Found ${deptResult.rows.length} departments`);

    // 2. Create taxonomy mappings
    console.log('\n📍 Creating taxonomy mappings...');
    let mappingCount = 0;

    for (const row of deptResult.rows) {
      const deptId = row.DEPT_ID;
      const deptName = row.DEPT_NAME;
      const shopifyCatId = DEPT_TO_SHOPIFY[deptId];

      if (!shopifyCatId) {
        console.log(`   ⚠️ No mapping for ${deptId} (${deptName}) - skipping`);
        continue;
      }

      // Check if category exists in taxonomy
      const catCheck = await connection.execute(
        `SELECT name, path FROM ATTR_MGR.EXT_TAXONOMY_CATEGORY 
         WHERE VERSION_TAG = :ver AND CATEGORY_ID = :cat`,
        { ver: versionTag, cat: shopifyCatId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (catCheck.rows.length === 0) {
        console.log(`   ⚠️ Category ${shopifyCatId} not found in taxonomy - skipping ${deptId}`);
        continue;
      }

      const catName = catCheck.rows[0].NAME;
      const catPath = catCheck.rows[0].PATH;

      // Upsert the mapping
      await connection.execute(
        `MERGE INTO ATTR_MGR.TENANT_CATEGORY_MAP tgt
         USING (SELECT :tenant as t, :bu as b, :dept as d, '*' as c, '*' as s FROM DUAL) src
         ON (tgt.TENANT_ID = src.t AND tgt.BUSINESS_UNIT_ID = src.b 
             AND NVL(tgt.DEPT_ID,'_') = NVL(src.d,'_')
             AND NVL(tgt.CLASS_ID,'_') = NVL(src.c,'_')
             AND NVL(tgt.SUBCLASS_ID,'_') = NVL(src.s,'_'))
         WHEN MATCHED THEN UPDATE SET
             VERSION_TAG = :ver,
             EXT_CATEGORY_ID = :cat,
             SOURCE = 'auto'
         WHEN NOT MATCHED THEN INSERT (TENANT_ID, BUSINESS_UNIT_ID, DEPT_ID, CLASS_ID, SUBCLASS_ID, VERSION_TAG, EXT_CATEGORY_ID, CONFIDENCE, SOURCE)
         VALUES (:tenant, :bu, :dept, '*', '*', :ver, :cat, 90, 'auto')`,
        { tenant: tenantId, bu: businessUnitId, dept: deptId, ver: versionTag, cat: shopifyCatId }
      );

      console.log(`   ✅ ${deptId} → ${catName} (${shopifyCatId})`);
      mappingCount++;
    }

    await connection.commit();
    console.log(`\n📍 Created ${mappingCount} taxonomy mappings`);

    // 3. Seed attribute hierarchy rules from templates
    console.log('\n🌱 Seeding attribute hierarchy rules...');
    let rulesCount = 0;

    for (const row of deptResult.rows) {
      const deptId = row.DEPT_ID;
      const shopifyCatId = DEPT_TO_SHOPIFY[deptId];
      if (!shopifyCatId) continue;

      // Get attributes for this category from taxonomy
      const attrResult = await connection.execute(
        `SELECT a.ATTR_CODE, a.NAME, ca.REQUIRED_HINT
         FROM ATTR_MGR.EXT_TAXONOMY_CATEGORY_ATTR ca
         JOIN ATTR_MGR.EXT_TAXONOMY_ATTRIBUTE a 
           ON a.VERSION_TAG = ca.VERSION_TAG AND a.ATTR_CODE = ca.ATTR_CODE
         WHERE ca.VERSION_TAG = :ver AND ca.CATEGORY_ID = :cat`,
        { ver: versionTag, cat: shopifyCatId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      // Shopify uses numeric codes: 1=Color, 3=Pattern, 30=Age group, 837=Gender
      // Our CHARACTERISTIC_TYPES also uses numeric codes (1=Color, etc.)
      // So we can directly use the Shopify code if it exists in our system
      
      for (const attr of attrResult.rows) {
        const charTypeId = attr.ATTR_CODE; // Direct mapping - Shopify code = our code
        
        // Check if this characteristic type exists in our system
        const typeCheck = await connection.execute(
          `SELECT CHARACTERISTIC_TYPE_ID FROM CHARACTERISTIC_TYPES 
           WHERE BUSINESS_UNIT_ID = :bu AND CHARACTERISTIC_TYPE_ID = :ct`,
          { bu: businessUnitId, ct: charTypeId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        if (typeCheck.rows.length === 0) continue; // Skip if type doesn't exist in our system

        const isMandatory = attr.REQUIRED_HINT === 'Y' ? 'Y' : 'N';

        await connection.execute(
          `MERGE INTO ATTR_MGR.ATTRIBUTE_HIERARCHY_RULES tgt
           USING (SELECT :tenant as t, :bu as b, 'DEPT' as lt, :lid as l, :ct as c FROM DUAL) src
           ON (tgt.TENANT_ID = src.t AND tgt.BUSINESS_UNIT_ID = src.b 
               AND tgt.LEVEL_TYPE = src.lt AND tgt.LEVEL_ID = src.l 
               AND tgt.CHARACTERISTIC_TYPE_ID = src.c)
           WHEN MATCHED THEN UPDATE SET
               IS_MANDATORY = :mand,
               APPLICABILITY = 'REQUIRED',
               UPDATED_AT = CURRENT_TIMESTAMP
           WHEN NOT MATCHED THEN INSERT (TENANT_ID, BUSINESS_UNIT_ID, LEVEL_TYPE, LEVEL_ID, CHARACTERISTIC_TYPE_ID, IS_MANDATORY, APPLICABILITY, CREATED_AT)
           VALUES (:tenant, :bu, 'DEPT', :lid, :ct, :mand, 'REQUIRED', CURRENT_TIMESTAMP)`,
          { tenant: tenantId, bu: businessUnitId, lid: deptId, ct: charTypeId, mand: isMandatory }
        );
        rulesCount++;
      }
    }

    await connection.commit();
    console.log(`\n🌱 Seeded ${rulesCount} attribute hierarchy rules`);

    // 4. Show final counts
    const finalCount = await connection.execute(
      `SELECT 
         (SELECT COUNT(*) FROM ATTR_MGR.TENANT_CATEGORY_MAP WHERE TENANT_ID = :tenant) as mappings,
         (SELECT COUNT(*) FROM ATTR_MGR.ATTRIBUTE_HIERARCHY_RULES WHERE TENANT_ID = :tenant) as rules
       FROM DUAL`,
      { tenant: tenantId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    console.log('\n📊 Final Counts for JDS_MPRD:');
    console.log(`   - Taxonomy Mappings: ${finalCount.rows[0].MAPPINGS}`);
    console.log(`   - Hierarchy Rules: ${finalCount.rows[0].RULES}`);

    console.log('\n✅ Done! Refresh the Rules page to see governance rules.');

  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  } finally {
    if (connection) await connection.close();
  }
}

main();
