#!/usr/bin/env node
/**
 * SUBCLASS-LEVEL SHOPIFY TAXONOMY MAPPING
 * 
 * This script creates a proper 3-tier hierarchy of attribute rules:
 * - DEPT level: Core universal attributes (Color, Age Group, Gender)
 * - CLASS level: Category-specific attributes (Neckline for TOPS, Pants Length for BTTM)
 * - SUBCLASS level: Product-specific attributes (Fabric, Care Instructions)
 * 
 * This enables a cohesive demo story where products inherit attributes
 * down the hierarchy chain.
 */

import oracledb from 'oracledb';

const DB_CONFIG = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1'
};

// ============================================================================
// MAPPING DEFINITIONS
// ============================================================================

// SUBCLASS to Shopify Category mappings
const SUBCLASS_MAPPINGS = {
  // TOPS subclasses
  'TOPS:BSTS': 'aa-1-13-8',   // Basic T-shirt -> T-Shirts
  'TOPS:GRTS': 'aa-1-13-8',   // Graphic T-shirt -> T-Shirts
  'TOPS:POLO': 'aa-1-13-6',   // Polo -> Polos
  'TOPS:SHRT': 'aa-1-13-7',   // Shirt -> Shirts
  'TOPS:TANK': 'aa-1-13-9',   // Tank -> Tank Tops
  'TOPS:CROP': 'aa-1-1-2-1',  // Crop -> Crop Tops
  'TOPS:JERS': 'aa-1-1-2',    // Jersey -> Activewear Tops
  'TOPS:BLYR': 'aa-1-1-2',    // Base Layer -> Activewear Tops
  'TOPS:HENL': 'aa-1-13-8',   // Henley -> T-Shirts
  'TOPS:LSLV': 'aa-1-13-8',   // Long Sleeve -> T-Shirts
  'TOPS:SLVL': 'aa-1-13-9',   // Sleeveless -> Tank Tops
  'TOPS:SOCC': 'aa-1-1-2',    // Soccer Jersey -> Activewear Tops
  
  // BOTTOMS subclasses
  'BTTM:JEAN': 'aa-1-12-4',   // Jeans
  'BTTM:JOGG': 'aa-1-12-7',   // Joggers
  'BTTM:LEGG': 'aa-1-12-8',   // Leggings
  'BTTM:PANT': 'aa-1-12-11',  // Trousers
  'BTTM:SHOR': 'aa-1-14',     // Shorts
  'BTTM:TRCK': 'aa-1-1-1-6',  // Track Pants
  'BTTM:FLCE': 'aa-1-12-7',   // Fleece -> Joggers
  'BTTM:FLJG': 'aa-1-12-7',   // Fleece Jogger -> Joggers
  'BTTM:FLOH': 'aa-1-12-7',   // Fleece Open Hem -> Joggers
  'BTTM:SKRT': 'aa-1-15',     // Skirt -> Skirts
  'BTTM:RNSH': 'aa-1-14',     // Running Shorts -> Shorts
  'BTTM:BBSH': 'aa-1-14',     // Basketball Shorts -> Shorts
  'BTTM:BKSH': 'aa-1-14',     // Bike Shorts -> Shorts
  'BTTM:CRGO': 'aa-1-14-2',   // Cargo Shorts
  
  // JACKET subclasses
  'JACK:BOMB': 'aa-1-10-2-2',   // Bomber Jackets
  'JACK:RAIN': 'aa-1-10-2-10',  // Rain Coats
  'JACK:WIND': 'aa-1-10-2-16',  // Windbreakers
  'JACK:TRCK': 'aa-1-1-7-5',    // Track Jackets
  'JACK:VEST': 'aa-1-10-6',     // Vests
  'JACK:PADD': 'aa-1-10-2-9',   // Puffer Jackets
  'JACK:COAC': 'aa-1-10-2-11',  // Sport Jackets
  'JACK:LETT': 'aa-1-10-2-15',  // Varsity Jackets
  'JACK:SHEL': 'aa-1-10-2-16',  // Shell -> Windbreakers
  'JACK:GILT': 'aa-1-10-6',     // Gilet -> Vests
  'JACK:LINE': 'aa-1-10-2',     // Liner -> Coats & Jackets
  'JACK:HARR': 'aa-1-10-2',     // Harrington -> Coats & Jackets
  'JACK:FIEL': 'aa-1-10-2',     // Field -> Coats & Jackets
  'JACK:BLZE': 'aa-1-10-2-11',  // Blazer -> Sport Jackets
  
  // COAT subclasses
  'COAT:PARK': 'aa-1-10-2-6',   // Parkas
  'COAT:TREN': 'aa-1-10-2-13',  // Trench Coats
  'COAT:ANOR': 'aa-1-10-2-8',   // Anorak -> Ponchos
  
  // MID LAYER subclasses
  'MDLA:SWEA': 'aa-1-13-14',    // Sweatshirt -> Sweatshirts
  'MDLA:CARD': 'aa-1-13-3',     // Cardigan -> Cardigans
  'MDLA:KNIT': 'aa-1-13-12',    // Knitwear -> Sweaters
  'MDLA:VEST': 'aa-1-10-6',     // Vest -> Vests
  
  // HEADWEAR subclasses
  'HEAD:BEAN': 'aa-2-17-2',     // Beanies
  'HEAD:SNAP': 'aa-2-17-10',    // Snapback Caps
  'HEAD:STRP': 'aa-2-17-1',     // Strapback -> Baseball Caps
  'HEAD:FITD': 'aa-2-17-1',     // Fitted -> Baseball Caps
  'HEAD:BUCK': 'aa-2-17-5',     // Bucket Hats
  'HEAD:TRCK': 'aa-2-17-14',    // Trucker Hats
  'HEAD:KNTH': 'aa-2-17-16',    // Knit Hat -> Winter Hats
  'HEAD:HDBD': 'aa-2-14-8',     // Headband -> Headbands
  'HAT:SNAP': 'aa-2-17-10',     // Snapback
  'HAT:STRP': 'aa-2-17-1',      // Strapback
  
  // SOCKS subclasses
  'SOCK:CREW': 'aa-1-18-3',     // Crew Socks
  'SOCK:NOSO': 'aa-1-18-10',    // No Show -> Sneaker Socks
  'SOCK:QRTR': 'aa-1-18-1',     // Quarter -> Ankle Socks
  'SOCK:KNEE': 'aa-1-18-8',     // Knee High -> Knee Socks
  'SOCK:CALF': 'aa-1-18-3',     // Calf -> Crew Socks
  
  // UNDERWEAR subclasses
  'UNDR:BXBR': 'aa-1-8-3-2',    // Boxer Brief
  'UNDR:BRAS': 'aa-1-1-6',      // Sports Bra
  
  // FOOTWEAR - BASKETBALL
  'BSKT:PERF': 'aa-8-1',        // Performance -> Athletic Shoes
  'BSKT:RTRO': 'aa-8-1',        // Retro -> Athletic Shoes
  'BSKT:SIGN': 'aa-8-1',        // Signature -> Athletic Shoes
  'BSKT:LIFE': 'aa-8-1',        // Lifestyle -> Athletic Shoes
  
  // FOOTWEAR - RUNNING
  'RUNN:PERF': 'aa-8-1',        // Performance
  'RUNN:LIFE': 'aa-8-1',        // Lifestyle
  'RUNN:TECH': 'aa-8-1',        // Technical
  'RUNN:RTRO': 'aa-8-1',        // Retro
  'RUNN:VIST': 'aa-8-1',        // Visible Tech
  'RUNN:TRAL': 'aa-8-1',        // Trail
  
  // FOOTWEAR - ATHLETIC CASUAL
  'ATHL:COIN': 'aa-8-8',        // Court Inspired -> Sneakers
  'ATHL:SKIN': 'aa-8-8',        // Skate Inspired -> Sneakers
  'ATHL:RNIN': 'aa-8-8',        // Running Inspired -> Sneakers
  'ATHL:CANV': 'aa-8-8',        // Canvas -> Sneakers
  'ATHL:SLON': 'aa-8-7',        // Slip On -> Slippers
  'ATHL:SLIP': 'aa-8-7',        // Slippers
  
  // FOOTWEAR - SANDALS
  'SAND:LISL': 'aa-8-6',        // Lifestyle Slide -> Sandals
  'SAND:SPSL': 'aa-8-6',        // Sport Slide -> Sandals
  'SAND:CLOG': 'aa-8-6',        // Clogs -> Sandals
  'SAND:STRP': 'aa-8-6',        // Strap -> Sandals
  'SAND:CLSD': 'aa-8-6',        // Closed -> Sandals
  
  // FOOTWEAR - BOOTS/OUTDOOR
  'OUTB:FASH': 'aa-8-3',        // Fashion -> Boots
  'OUTB:HIKG': 'aa-8-3',        // Hiking -> Boots
  'OUTB:WTHR': 'aa-8-3',        // Weatherproof -> Boots
  'OUTB:RUBB': 'aa-8-3',        // Rubber -> Boots
  'OUTD:FASH': 'aa-8-3',        // Fashion -> Boots
  'OUTD:HIKG': 'aa-8-3',        // Hiking -> Boots
  
  // FOOTWEAR - CASUAL
  'CASL:BOAT': 'aa-8-9',        // Boat -> Flats
  'CASL:LOAF': 'aa-8-9',        // Loafer -> Flats
  'CASL:MOCC': 'aa-8-9',        // Moccasins -> Flats
  'CASL:FLAT': 'aa-8-9',        // Flats
  'CASL:LACE': 'aa-8-8',        // Lace Up -> Sneakers
  
  // FOOTWEAR - TRAINING
  'TRNG:BASE': 'aa-8-1',        // Baseball -> Athletic
  'TRNG:FOOT': 'aa-8-1',        // Football -> Athletic
  'TRNG:SOCC': 'aa-8-1',        // Soccer -> Athletic
  'TRNG:TNIS': 'aa-8-1',        // Tennis -> Athletic
  'TRNG:CRSS': 'aa-8-1',        // CrossFit -> Athletic
  
  // BAGS subclasses
  'BAGS:BKPK': 'aa-5-4-17',     // Backpack -> School Bags
  'BAGS:DUFF': 'aa-5-4-2',      // Duffle -> Barrel Bags
  'BAGS:FNNY': 'aa-5-4-7',      // Fanny Pack -> Cross Body
  'BAGS:CRSS': 'aa-5-4-7',      // Crossbody -> Cross Body
  'BAGS:TOTE': 'aa-5-4-18',     // Tote -> Shopper Bags
  'BAGS:CLCH': 'aa-5-4-5',      // Clutch -> Clutch Bags
  'BAGS:MSNG': 'aa-5-4-16',     // Messenger -> Satchel
  'BAGS:HAND': 'aa-5-4',        // Handbag
  'BAGS:SATC': 'aa-5-4-16',     // Satchel
  'BAGS:BCKT': 'aa-5-4-4',      // Bucket -> Bucket Bags
  'BAGS:DRAW': 'aa-5-4',        // Drawstring -> Handbags
  'BAGS:LUGG': 'aa-5-4',        // Luggage
  'BAGS:LPTP': 'aa-5-4',        // Laptop
  
  // ONE PIECE subclasses
  'ONEP:DRES': 'aa-1-4',        // Dress -> Dresses
  'ONEP:BODY': 'aa-1-13-2',     // Bodysuit -> Bodysuits
  'ONEP:JUMP': 'aa-1-9',        // Jumpsuit -> One-Pieces
  'ONEP:OVER': 'aa-1-9',        // Overall -> One-Pieces
  'ONEP:ROBE': 'aa-1-17-5',     // Robe -> Robes
  'ONEP:CVRA': 'aa-1-9',        // Coverall -> One-Pieces
  
  // SETS subclasses
  'SETS:OUTF': 'aa-1-11',       // Outfit Sets
  'SETS:TKST': 'aa-1-11',       // Track Suits -> Outfit Sets
  'SETS:FLEE': 'aa-1-11',       // Fleece Suit -> Outfit Sets
  'SETS:PYJA': 'aa-1-17-4',     // Pyjamas -> Pajamas
  
  // SWIMWEAR subclasses  
  'SWIM:SWMS': 'aa-1-20-3',     // Swim Shorts -> Swim Boxers
  'SWIM:SWSH': 'aa-1-20-3',     // Swim Shorts -> Swim Boxers
  'SWIM:BKNI': 'aa-1-20-6',     // Bikini Sets -> Classic Bikinis
  
  // FITNESS subclasses (Women's)
  'FIT:BRA': 'aa-1-1-6',        // Sports Bras
  'FIT:TGHT': 'aa-1-1-1-5',     // Tights
  'FIT:TOP': 'aa-1-1-2',        // Activewear Tops
  'FIT:SHOR': 'aa-1-1-1-3',     // Shorts
  
  // NECKWEAR subclasses
  'NECK:SCRF': 'aa-2-26',       // Scarf -> Scarves & Shawls
  'NECK:GAIT': 'aa-2-22',       // Gaitor -> Neck Gaiters
  'NECK:BNDA': 'aa-2-4',        // Bandana -> Bandanas & Headties
  
  // MISC ACCESSORIES
  'MSAC:BELT': 'aa-2-6',        // Belts
  'MSAC:WALL': 'aa-5-5-7',      // Wallet -> Wallets
  'MSAC:CRDH': 'aa-5-5-2',      // Card Holder -> Card Cases
  'MSAC:KEYR': 'aa-4-1',        // Keyring -> Keychains
  'MSAC:GLVS': 'aa-2-13',       // Gloves -> Gloves & Mittens
  
  // JEWELRY
  'JEWL:BRAC': 'aa-6-3',        // Bracelet -> Bracelets
  'JEWL:NECK': 'aa-6-8',        // Necklace -> Necklaces
  'JEWL:RING': 'aa-6-9',        // Ring -> Rings
  'JEWL:WATC': 'aa-6-11',       // Watches
  
  // EYEWEAR
  'EYEW:SUNG': 'aa-2-27',       // Sunglasses
  
  // SHOE CARE
  'SHCR:LACE': 'aa-7-6',        // Laces -> Shoelaces
  'SHCR:INSL': 'aa-7-5',        // Insoles -> Shoe Inserts
  
  // WINTER ACCESSORIES
  'WTAC:GLOV': 'aa-2-13',       // Gloves -> Gloves & Mittens
};

// CLASS to Shopify Category mappings (for classes not in subclass map)
const CLASS_MAPPINGS = {
  'TOPS': 'aa-1-13',       // Clothing Tops
  'BTTM': 'aa-1-12',       // Pants
  'JACK': 'aa-1-10-2',     // Coats & Jackets
  'COAT': 'aa-1-10-2',     // Coats & Jackets
  'MDLA': 'aa-1-13',       // Clothing Tops
  'ONEP': 'aa-1-9',        // One-Pieces
  'SETS': 'aa-1-11',       // Outfit Sets
  'SWIM': 'aa-1-20',       // Swimwear
  'HEAD': 'aa-2-17',       // Hats
  'HAT': 'aa-2-17',        // Hats
  'SOCK': 'aa-1-18',       // Socks
  'UNDR': 'aa-1-6',        // Lingerie
  'NECK': 'aa-2-26',       // Scarves & Shawls
  'BAGS': 'aa-5-4',        // Handbags
  'BSKT': 'aa-8-1',        // Athletic Shoes
  'RUNN': 'aa-8-1',        // Athletic Shoes
  'ATHL': 'aa-8-8',        // Sneakers
  'SAND': 'aa-8-6',        // Sandals
  'OUTB': 'aa-8-3',        // Boots
  'OUTD': 'aa-8-3',        // Boots
  'CASL': 'aa-8-9',        // Flats
  'TRNG': 'aa-8-1',        // Athletic Shoes
  'ELEC': 'el',            // Electronics
  'EQPM': 'sg',            // Sporting Goods
  'EYEW': 'aa-2-27',       // Sunglasses
  'HYDR': 'sg',            // Sporting Goods
  'JEWL': 'aa-6',          // Jewelry
  'LIFE': 'hg',            // Home & Garden
  'MSAC': 'aa-2',          // Clothing Accessories
  'PRCR': 'hb',            // Health & Beauty
  'SHCR': 'aa-7',          // Shoe Accessories
  'SKTB': 'sg',            // Sporting Goods
  'FIT': 'aa-1-1',         // Activewear
  'WTAC': 'aa-2',          // Clothing Accessories
  'SWTS': 'aa-1-13-12',    // Sweaters
  'UTIL': 'na',            // Uncategorized
};

// DEPT level mappings (fallback)
const DEPT_MAPPINGS = {
  'MNAP': 'aa-1',     // Mens Apparel -> Clothing
  'WNAP': 'aa-1',     // Womens Apparel -> Clothing
  'CHAP': 'aa-1-2',   // Childrens Apparel -> Baby & Toddler Clothing
  'JNAP': 'aa-1',     // Junior Apparel -> Clothing
  'INAP': 'aa-1-2',   // Infants Apparel -> Baby & Toddler Clothing
  'MNFT': 'aa-8',     // Mens Footwear -> Shoes
  'WMFT': 'aa-8',     // Womens Footwear -> Shoes
  'CHFT': 'aa-8-2',   // Childrens Footwear -> Baby & Toddler Shoes
  'JNFT': 'aa-8',     // Junior Footwear -> Shoes
  'INFT': 'aa-8-2',   // Infants Footwear -> Baby & Toddler Shoes
  'CLAC': 'aa-2',     // Clothing Accessories
  'OTAC': 'aa',       // Other Accessories -> Apparel & Accessories
  'UTIL': 'na',       // Utility -> Uncategorized
};

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function main() {
  let conn;
  try {
    console.log('🚀 Starting Subclass-Level Taxonomy Mapping...\n');
    conn = await oracledb.getConnection(DB_CONFIG);
    
    const tenantId = 'JDS_MPRD';
    const buId = 1;
    
    // Step 1: Fetch hierarchy from DB
    console.log('📋 Fetching hierarchy from HIERARCHY_CACHE...');
    const hierRes = await conn.execute(`
      SELECT DISTINCT 
        dept_id, dept_name, 
        class_id, class_descr, 
        sub_class_id, sub_class_descr
      FROM HIERARCHY_CACHE
      WHERE tenant_id = :tenant 
        AND business_unit_id = :bu
        AND sub_class_id IS NOT NULL
      ORDER BY dept_id, class_id, sub_class_id
    `, { tenant: tenantId, bu: buId });
    
    console.log(`   Found ${hierRes.rows.length} subclass items\n`);
    
    // Step 2: Create mappings for each subclass
    console.log('🗺️ Creating TENANT_CATEGORY_MAP entries...');
    let mappingsCreated = 0;
    let mappingsSkipped = 0;
    
    for (const row of hierRes.rows) {
      const [deptId, deptName, classId, classDescr, subclassId, subclassDescr] = row;
      
      // Try subclass mapping first, then class, then dept
      const subclassKey = `${classId}:${subclassId}`;
      let shopifyCat = SUBCLASS_MAPPINGS[subclassKey];
      let mappingLevel = 'SUBCLASS';
      
      if (!shopifyCat) {
        shopifyCat = CLASS_MAPPINGS[classId];
        mappingLevel = 'CLASS';
      }
      
      if (!shopifyCat) {
        shopifyCat = DEPT_MAPPINGS[deptId];
        mappingLevel = 'DEPT';
      }
      
      if (!shopifyCat) {
        console.log(`   ⚠️ No mapping for ${deptId}/${classId}/${subclassId}`);
        mappingsSkipped++;
        continue;
      }
      
      // Upsert the mapping
      try {
        await conn.execute(`
          MERGE INTO TENANT_CATEGORY_MAP tcm
          USING (SELECT :tenant AS tenant_id, :bu AS business_unit_id, 
                        :dept AS dept_id, :cls AS class_id, :sub AS subclass_id FROM DUAL) src
          ON (tcm.tenant_id = src.tenant_id 
              AND tcm.business_unit_id = src.business_unit_id
              AND tcm.dept_id = src.dept_id 
              AND tcm.class_id = src.class_id 
              AND tcm.subclass_id = src.subclass_id)
          WHEN MATCHED THEN
            UPDATE SET ext_category_id = :cat, source = :src_type
          WHEN NOT MATCHED THEN
            INSERT (tenant_id, business_unit_id, dept_id, class_id, subclass_id, 
                    version_tag, ext_category_id, confidence, source, created_by, created_at)
            VALUES (:tenant, :bu, :dept, :cls, :sub, 'v1', :cat, 100, :src_type, 'SUBCLASS_SEED', SYSTIMESTAMP)
        `, {
          tenant: tenantId,
          bu: buId,
          dept: deptId,
          cls: classId,
          sub: subclassId,
          cat: shopifyCat,
          src_type: `AUTO_${mappingLevel}`
        });
        mappingsCreated++;
      } catch (err) {
        console.log(`   ❌ Error mapping ${deptId}/${classId}/${subclassId}: ${err.message}`);
      }
    }
    
    await conn.commit();
    console.log(`   ✅ Created/updated ${mappingsCreated} mappings (${mappingsSkipped} skipped)\n`);
    
    // Step 3: Seed hierarchy rules at SUBCLASS level
    console.log('🌱 Seeding ATTRIBUTE_HIERARCHY_RULES at SUBCLASS level...');
    let rulesCreated = 0;
    
    // Get unique category->attribute mappings from Shopify
    const catAttrRes = await conn.execute(`
      SELECT DISTINCT ca.category_id, ca.attr_code, ca.required_hint
      FROM EXT_TAXONOMY_CATEGORY_ATTR ca
      WHERE ca.version_tag = 'v1'
      ORDER BY ca.category_id, ca.attr_code
    `);
    
    // Build a lookup map
    const categoryAttrs = new Map();
    for (const row of catAttrRes.rows) {
      const [catId, attrCode, requiredHint] = row;
      if (!categoryAttrs.has(catId)) {
        categoryAttrs.set(catId, []);
      }
      categoryAttrs.get(catId).push({ attrCode, required: requiredHint === 'Y' });
    }
    
    // Get our CHARACTERISTIC_TYPES
    const charTypesRes = await conn.execute(`
      SELECT DISTINCT characteristic_type_id 
      FROM CHARACTERISTIC_TYPES 
      WHERE business_unit_id = :bu
    `, { bu: buId });
    const validCharTypes = new Set(charTypesRes.rows.map(r => r[0]));
    
    // For each hierarchy item, create rules
    for (const row of hierRes.rows) {
      const [deptId, deptName, classId, classDescr, subclassId, subclassDescr] = row;
      
      const subclassKey = `${classId}:${subclassId}`;
      let shopifyCat = SUBCLASS_MAPPINGS[subclassKey] || CLASS_MAPPINGS[classId] || DEPT_MAPPINGS[deptId];
      
      if (!shopifyCat) continue;
      
      const attrs = categoryAttrs.get(shopifyCat) || [];
      
      for (const attr of attrs) {
        // Only create rule if we have this characteristic type
        if (!validCharTypes.has(attr.attrCode)) continue;
        
        try {
          await conn.execute(`
            MERGE INTO ATTRIBUTE_HIERARCHY_RULES ahr
            USING (SELECT :tenant AS tenant_id, :bu AS business_unit_id,
                          'SUBCLASS' AS level_type, :dept||'/'||:cls||'/'||:sub AS level_id,
                          :char_type AS characteristic_type_id FROM DUAL) src
            ON (ahr.tenant_id = src.tenant_id 
                AND ahr.business_unit_id = src.business_unit_id
                AND ahr.level_type = src.level_type
                AND ahr.level_id = src.level_id
                AND ahr.characteristic_type_id = src.characteristic_type_id)
            WHEN NOT MATCHED THEN
              INSERT (tenant_id, business_unit_id, level_type, level_id, 
                      characteristic_type_id, is_mandatory, applicability, created_at, created_by)
              VALUES (:tenant, :bu, 'SUBCLASS', :dept||'/'||:cls||'/'||:sub,
                      :char_type, :mandatory, :applic, SYSTIMESTAMP, 'SUBCLASS_SEED')
          `, {
            tenant: tenantId,
            bu: buId,
            dept: deptId,
            cls: classId,
            sub: subclassId,
            char_type: attr.attrCode,
            mandatory: attr.required ? 'Y' : 'N',
            applic: attr.required ? 'REQUIRED' : 'OPTIONAL'
          });
          rulesCreated++;
        } catch (err) {
          // Ignore duplicates
        }
      }
    }
    
    await conn.commit();
    console.log(`   ✅ Created ${rulesCreated} SUBCLASS-level rules\n`);
    
    // Step 4: Summary
    console.log('📊 Final Summary:');
    
    const mappingCount = await conn.execute(`
      SELECT level_type, COUNT(*) as cnt
      FROM (
        SELECT 
          CASE 
            WHEN subclass_id IS NOT NULL AND subclass_id != '*' THEN 'SUBCLASS'
            WHEN class_id IS NOT NULL AND class_id != '*' THEN 'CLASS'
            ELSE 'DEPT'
          END as level_type
        FROM TENANT_CATEGORY_MAP
        WHERE tenant_id = :tenant AND business_unit_id = :bu
      )
      GROUP BY level_type
    `, { tenant: tenantId, bu: buId });
    
    console.log('   Taxonomy Mappings:');
    for (const row of mappingCount.rows) {
      console.log(`     - ${row[0]}: ${row[1]}`);
    }
    
    const ruleCount = await conn.execute(`
      SELECT level_type, COUNT(*) as cnt
      FROM ATTRIBUTE_HIERARCHY_RULES
      WHERE tenant_id = :tenant AND business_unit_id = :bu
      GROUP BY level_type
    `, { tenant: tenantId, bu: buId });
    
    console.log('   Hierarchy Rules:');
    for (const row of ruleCount.rows) {
      console.log(`     - ${row[0]}: ${row[1]}`);
    }
    
    console.log('\n✅ Done! Refresh the Rules page to see granular SUBCLASS rules.');
    
  } catch (err) {
    console.error('❌ Script failed:', err);
    process.exit(1);
  } finally {
    if (conn) {
      try { await conn.close(); } catch (e) { /* ignore */ }
    }
  }
}

main();
