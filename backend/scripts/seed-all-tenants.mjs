#!/usr/bin/env node
/**
 * MULTI-TENANT SUBCLASS-LEVEL SHOPIFY TAXONOMY MAPPING
 * 
 * Seeds subclass-level rules for all tenants: JDS_MPRD, HRI_MPRD, OCI
 */

import oracledb from 'oracledb';

const DB_CONFIG = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1'
};

// Import mappings from the original script
const SUBCLASS_MAPPINGS = {
  // TOPS subclasses
  'TOPS:BSTS': 'aa-1-13-8', 'TOPS:GRTS': 'aa-1-13-8', 'TOPS:POLO': 'aa-1-13-6',
  'TOPS:SHRT': 'aa-1-13-7', 'TOPS:TANK': 'aa-1-13-9', 'TOPS:CROP': 'aa-1-1-2-1',
  'TOPS:JERS': 'aa-1-1-2', 'TOPS:BLYR': 'aa-1-1-2', 'TOPS:HENL': 'aa-1-13-8',
  'TOPS:LSLV': 'aa-1-13-8', 'TOPS:SLVL': 'aa-1-13-9', 'TOPS:SOCC': 'aa-1-1-2',
  // BOTTOMS
  'BTTM:JEAN': 'aa-1-12-4', 'BTTM:JOGG': 'aa-1-12-7', 'BTTM:LEGG': 'aa-1-12-8',
  'BTTM:PANT': 'aa-1-12-11', 'BTTM:SHOR': 'aa-1-14', 'BTTM:TRCK': 'aa-1-1-1-6',
  'BTTM:FLCE': 'aa-1-12-7', 'BTTM:FLJG': 'aa-1-12-7', 'BTTM:FLOH': 'aa-1-12-7',
  'BTTM:SKRT': 'aa-1-15', 'BTTM:RNSH': 'aa-1-14', 'BTTM:BBSH': 'aa-1-14',
  'BTTM:BKSH': 'aa-1-14', 'BTTM:CRGO': 'aa-1-14-2',
  // JACKET
  'JACK:BOMB': 'aa-1-10-2-2', 'JACK:RAIN': 'aa-1-10-2-10', 'JACK:WIND': 'aa-1-10-2-16',
  'JACK:TRCK': 'aa-1-1-7-5', 'JACK:VEST': 'aa-1-10-6', 'JACK:PADD': 'aa-1-10-2-9',
  'JACK:COAC': 'aa-1-10-2-11', 'JACK:LETT': 'aa-1-10-2-15', 'JACK:SHEL': 'aa-1-10-2-16',
  'JACK:GILT': 'aa-1-10-6', 'JACK:LINE': 'aa-1-10-2', 'JACK:HARR': 'aa-1-10-2',
  'JACK:FIEL': 'aa-1-10-2', 'JACK:BLZE': 'aa-1-10-2-11',
  // COAT
  'COAT:PARK': 'aa-1-10-2-6', 'COAT:TREN': 'aa-1-10-2-13', 'COAT:ANOR': 'aa-1-10-2-8',
  // MID LAYER
  'MDLA:SWEA': 'aa-1-13-14', 'MDLA:CARD': 'aa-1-13-3', 'MDLA:KNIT': 'aa-1-13-12', 'MDLA:VEST': 'aa-1-10-6',
  // HEADWEAR
  'HEAD:BEAN': 'aa-2-17-2', 'HEAD:SNAP': 'aa-2-17-10', 'HEAD:STRP': 'aa-2-17-1',
  'HEAD:FITD': 'aa-2-17-1', 'HEAD:BUCK': 'aa-2-17-5', 'HEAD:TRCK': 'aa-2-17-14',
  'HEAD:KNTH': 'aa-2-17-16', 'HEAD:HDBD': 'aa-2-14-8',
  'HAT:SNAP': 'aa-2-17-10', 'HAT:STRP': 'aa-2-17-1',
  // SOCKS
  'SOCK:CREW': 'aa-1-18-3', 'SOCK:NOSO': 'aa-1-18-10', 'SOCK:QRTR': 'aa-1-18-1',
  'SOCK:KNEE': 'aa-1-18-8', 'SOCK:CALF': 'aa-1-18-3',
  // UNDERWEAR
  'UNDR:BXBR': 'aa-1-8-3-2', 'UNDR:BRAS': 'aa-1-1-6',
  // FOOTWEAR - BASKETBALL
  'BSKT:PERF': 'aa-8-1', 'BSKT:RTRO': 'aa-8-1', 'BSKT:SIGN': 'aa-8-1', 'BSKT:LIFE': 'aa-8-1',
  // FOOTWEAR - RUNNING
  'RUNN:PERF': 'aa-8-1', 'RUNN:LIFE': 'aa-8-1', 'RUNN:TECH': 'aa-8-1',
  'RUNN:RTRO': 'aa-8-1', 'RUNN:VIST': 'aa-8-1', 'RUNN:TRAL': 'aa-8-1',
  // FOOTWEAR - ATHLETIC CASUAL
  'ATHL:COIN': 'aa-8-8', 'ATHL:SKIN': 'aa-8-8', 'ATHL:RNIN': 'aa-8-8',
  'ATHL:CANV': 'aa-8-8', 'ATHL:SLON': 'aa-8-7', 'ATHL:SLIP': 'aa-8-7',
  // FOOTWEAR - SANDALS
  'SAND:LISL': 'aa-8-6', 'SAND:SPSL': 'aa-8-6', 'SAND:CLOG': 'aa-8-6',
  'SAND:STRP': 'aa-8-6', 'SAND:CLSD': 'aa-8-6',
  // FOOTWEAR - BOOTS/OUTDOOR
  'OUTB:FASH': 'aa-8-3', 'OUTB:HIKG': 'aa-8-3', 'OUTB:WTHR': 'aa-8-3',
  'OUTB:RUBB': 'aa-8-3', 'OUTD:FASH': 'aa-8-3', 'OUTD:HIKG': 'aa-8-3',
  // FOOTWEAR - CASUAL
  'CASL:BOAT': 'aa-8-9', 'CASL:LOAF': 'aa-8-9', 'CASL:MOCC': 'aa-8-9',
  'CASL:FLAT': 'aa-8-9', 'CASL:LACE': 'aa-8-8',
  // FOOTWEAR - TRAINING
  'TRNG:BASE': 'aa-8-1', 'TRNG:FOOT': 'aa-8-1', 'TRNG:SOCC': 'aa-8-1',
  'TRNG:TNIS': 'aa-8-1', 'TRNG:CRSS': 'aa-8-1',
  // BAGS
  'BAGS:BKPK': 'aa-5-4-17', 'BAGS:DUFF': 'aa-5-4-2', 'BAGS:FNNY': 'aa-5-4-7',
  'BAGS:CRSS': 'aa-5-4-7', 'BAGS:TOTE': 'aa-5-4-18', 'BAGS:CLCH': 'aa-5-4-5',
  'BAGS:MSNG': 'aa-5-4-16', 'BAGS:HAND': 'aa-5-4', 'BAGS:SATC': 'aa-5-4-16',
  'BAGS:BCKT': 'aa-5-4-4', 'BAGS:DRAW': 'aa-5-4', 'BAGS:LUGG': 'aa-5-4', 'BAGS:LPTP': 'aa-5-4',
  // ONE PIECE
  'ONEP:DRES': 'aa-1-4', 'ONEP:BODY': 'aa-1-13-2', 'ONEP:JUMP': 'aa-1-9',
  'ONEP:OVER': 'aa-1-9', 'ONEP:ROBE': 'aa-1-17-5', 'ONEP:CVRA': 'aa-1-9',
  // SETS
  'SETS:OUTF': 'aa-1-11', 'SETS:TKST': 'aa-1-11', 'SETS:FLEE': 'aa-1-11', 'SETS:PYJA': 'aa-1-17-4',
  // SWIMWEAR
  'SWIM:SWMS': 'aa-1-20-3', 'SWIM:SWSH': 'aa-1-20-3', 'SWIM:BKNI': 'aa-1-20-6',
  // FITNESS
  'FIT:BRA': 'aa-1-1-6', 'FIT:TGHT': 'aa-1-1-1-5', 'FIT:TOP': 'aa-1-1-2', 'FIT:SHOR': 'aa-1-1-1-3',
  // NECKWEAR
  'NECK:SCRF': 'aa-2-26', 'NECK:GAIT': 'aa-2-22', 'NECK:BNDA': 'aa-2-4',
  // MISC ACCESSORIES
  'MSAC:BELT': 'aa-2-6', 'MSAC:WALL': 'aa-5-5-7', 'MSAC:CRDH': 'aa-5-5-2',
  'MSAC:KEYR': 'aa-4-1', 'MSAC:GLVS': 'aa-2-13',
  // JEWELRY
  'JEWL:BRAC': 'aa-6-3', 'JEWL:NECK': 'aa-6-8', 'JEWL:RING': 'aa-6-9', 'JEWL:WATC': 'aa-6-11',
  // EYEWEAR
  'EYEW:SUNG': 'aa-2-27',
  // SHOE CARE
  'SHCR:LACE': 'aa-7-6', 'SHCR:INSL': 'aa-7-5',
  // WINTER ACCESSORIES
  'WTAC:GLOV': 'aa-2-13',
};

const CLASS_MAPPINGS = {
  'TOPS': 'aa-1-13', 'BTTM': 'aa-1-12', 'JACK': 'aa-1-10-2', 'COAT': 'aa-1-10-2',
  'MDLA': 'aa-1-13', 'ONEP': 'aa-1-9', 'SETS': 'aa-1-11', 'SWIM': 'aa-1-20',
  'HEAD': 'aa-2-17', 'HAT': 'aa-2-17', 'SOCK': 'aa-1-18', 'UNDR': 'aa-1-6',
  'NECK': 'aa-2-26', 'BAGS': 'aa-5-4', 'BSKT': 'aa-8-1', 'RUNN': 'aa-8-1',
  'ATHL': 'aa-8-8', 'SAND': 'aa-8-6', 'OUTB': 'aa-8-3', 'OUTD': 'aa-8-3',
  'CASL': 'aa-8-9', 'TRNG': 'aa-8-1', 'ELEC': 'el', 'EQPM': 'sg', 'EYEW': 'aa-2-27',
  'HYDR': 'sg', 'JEWL': 'aa-6', 'LIFE': 'hg', 'MSAC': 'aa-2', 'PRCR': 'hb',
  'SHCR': 'aa-7', 'SKTB': 'sg', 'FIT': 'aa-1-1', 'WTAC': 'aa-2', 'SWTS': 'aa-1-13-12', 'UTIL': 'na',
};

async function seedTenant(conn, tenantId, buId) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 Processing ${tenantId} BU ${buId}...`);
  console.log('='.repeat(60));

  // Fetch hierarchy
  const hierRes = await conn.execute(`
    SELECT DISTINCT dept_id, dept_name, class_id, class_descr, sub_class_id, sub_class_descr
    FROM HIERARCHY_CACHE
    WHERE tenant_id = :tenant AND business_unit_id = :bu AND sub_class_id IS NOT NULL
    ORDER BY dept_id, class_id, sub_class_id
  `, { tenant: tenantId, bu: buId });

  const items = hierRes.rows || [];
  console.log(`   Found ${items.length} subclass items`);

  if (items.length === 0) {
    console.log('   ⚠️ No hierarchy data - skipping');
    return { mappings: 0, rules: 0 };
  }

  // Get valid characteristic types for this BU
  const charTypesRes = await conn.execute(
    `SELECT DISTINCT characteristic_type_id FROM CHARACTERISTIC_TYPES WHERE business_unit_id = :bu`,
    { bu: buId }
  );
  const validCharTypes = new Set((charTypesRes.rows || []).map(r => r[0]));

  // Get category->attribute mappings from Shopify
  const catAttrRes = await conn.execute(`
    SELECT DISTINCT ca.category_id, ca.attr_code, ca.required_hint
    FROM EXT_TAXONOMY_CATEGORY_ATTR ca WHERE ca.version_tag = 'v1'
  `);
  const categoryAttrs = new Map();
  for (const row of catAttrRes.rows || []) {
    const [catId, attrCode, requiredHint] = row;
    if (!categoryAttrs.has(catId)) categoryAttrs.set(catId, []);
    categoryAttrs.get(catId).push({ attrCode, required: requiredHint === 'Y' });
  }

  let mappingsCreated = 0;
  let rulesCreated = 0;

  for (const row of items) {
    const [deptId, deptName, classId, classDescr, subclassId, subclassDescr] = row;
    
    // Find best Shopify category match
    const subclassKey = `${classId}:${subclassId}`;
    let shopifyCat = SUBCLASS_MAPPINGS[subclassKey] || CLASS_MAPPINGS[classId] || 'aa-1';

    // Create mapping
    try {
      await conn.execute(`
        MERGE INTO TENANT_CATEGORY_MAP tcm
        USING (SELECT :tenant AS tenant_id, :bu AS business_unit_id, 
                      :dept AS dept_id, :cls AS class_id, :sub AS subclass_id FROM DUAL) src
        ON (tcm.tenant_id = src.tenant_id AND tcm.business_unit_id = src.business_unit_id
            AND tcm.dept_id = src.dept_id AND tcm.class_id = src.class_id AND tcm.subclass_id = src.subclass_id)
        WHEN MATCHED THEN UPDATE SET ext_category_id = :cat, source = 'AUTO_SUBCLASS'
        WHEN NOT MATCHED THEN
          INSERT (tenant_id, business_unit_id, dept_id, class_id, subclass_id, 
                  version_tag, ext_category_id, confidence, source, created_by, created_at)
          VALUES (:tenant, :bu, :dept, :cls, :sub, 'v1', :cat, 100, 'AUTO_SUBCLASS', 'MULTI_SEED', SYSTIMESTAMP)
      `, { tenant: tenantId, bu: buId, dept: deptId, cls: classId, sub: subclassId, cat: shopifyCat });
      mappingsCreated++;
    } catch (err) { /* ignore */ }

    // Create rules
    const attrs = categoryAttrs.get(shopifyCat) || [];
    for (const attr of attrs) {
      if (!validCharTypes.has(attr.attrCode)) continue;
      try {
        await conn.execute(`
          MERGE INTO ATTRIBUTE_HIERARCHY_RULES ahr
          USING (SELECT :tenant AS tenant_id, :bu AS business_unit_id,
                        'SUBCLASS' AS level_type, :levelId AS level_id,
                        :char_type AS characteristic_type_id FROM DUAL) src
          ON (ahr.tenant_id = src.tenant_id AND ahr.business_unit_id = src.business_unit_id
              AND ahr.level_type = src.level_type AND ahr.level_id = src.level_id
              AND ahr.characteristic_type_id = src.characteristic_type_id)
          WHEN NOT MATCHED THEN
            INSERT (tenant_id, business_unit_id, level_type, level_id, 
                    characteristic_type_id, is_mandatory, applicability, created_at, created_by)
            VALUES (:tenant, :bu, 'SUBCLASS', :levelId, :char_type, :mandatory, :applic, SYSTIMESTAMP, 'MULTI_SEED')
        `, {
          tenant: tenantId, bu: buId, levelId: `${deptId}/${classId}/${subclassId}`,
          char_type: attr.attrCode, mandatory: attr.required ? 'Y' : 'N',
          applic: attr.required ? 'REQUIRED' : 'OPTIONAL'
        });
        rulesCreated++;
      } catch (err) { /* ignore duplicates */ }
    }
  }

  await conn.commit();
  console.log(`   ✅ Mappings: ${mappingsCreated}, Rules: ${rulesCreated}`);
  return { mappings: mappingsCreated, rules: rulesCreated };
}

async function main() {
  let conn;
  try {
    console.log('🚀 Multi-Tenant Subclass-Level Taxonomy Seeding\n');
    conn = await oracledb.getConnection(DB_CONFIG);

    // Define tenants and their BUs
    const targets = [
      { tenant: 'HRI_MPRD', bus: [1, 2] },
      { tenant: 'OCI', bus: [1, 30, 95] }
    ];

    const totals = { mappings: 0, rules: 0 };

    for (const target of targets) {
      for (const bu of target.bus) {
        const result = await seedTenant(conn, target.tenant, bu);
        totals.mappings += result.mappings;
        totals.rules += result.rules;
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL SUMMARY');
    console.log('='.repeat(60));

    const summaryRes = await conn.execute(`
      SELECT tenant_id, level_type, COUNT(*) as cnt 
      FROM ATTRIBUTE_HIERARCHY_RULES 
      GROUP BY tenant_id, level_type 
      ORDER BY tenant_id, level_type
    `);
    
    console.log('\nRules by Tenant/Level:');
    for (const row of summaryRes.rows || []) {
      console.log(`   ${row[0] || '(null)'} / ${row[1]}: ${row[2]}`);
    }

    console.log(`\n✅ Total new: ${totals.mappings} mappings, ${totals.rules} rules`);

  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  } finally {
    if (conn) await conn.close();
  }
}

main();
