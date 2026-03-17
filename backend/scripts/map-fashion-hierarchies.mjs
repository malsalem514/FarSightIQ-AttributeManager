import oracledb from 'oracledb';

// Configuration
const CONFIG = {
    oracle: {
        user: 'system',
        password: 'OraclePass123',
        connectString: 'localhost:1521/FREEPDB1'
    },
    businessUnitId: 1
};

async function mapHierarchies() {
    let conn;
    try {
        console.log('🚀 Starting Hierarchy Mapping (Tier 2)...');
        conn = await oracledb.getConnection(CONFIG.oracle);
        
        // 1. Get all pending mappings
        const pendingResult = await conn.execute(
            `SELECT MAP_ID, MASTER_CATEGORY, SUB_CATEGORY, ARTICLE_TYPE 
             FROM ATTR_MGR.LANDING_FASHION_HIERARCHY_MAP 
             WHERE MAPPING_STATUS = 'PENDING'`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        console.log(`🔍 Found ${pendingResult.rows.length} pending hierarchies to map.`);

        let mappedCount = 0;

        for (const row of pendingResult.rows) {
            const articleType = row.ARTICLE_TYPE;
            const subCategory = row.SUB_CATEGORY;
            
            // Try to find a match in HIERARCHY_CACHE
            // Strategy: Search for ARTICLE_TYPE in SUB_CLASS_DESCR
            const matchResult = await conn.execute(
                `SELECT DEPT_ID, CLASS_ID, SUB_CLASS_ID
                 FROM ATTR_MGR.HIERARCHY_CACHE
                 WHERE (UPPER(SUB_CLASS_DESCR) LIKE UPPER(:term) OR UPPER(CLASS_DESCR) LIKE UPPER(:term))
                   AND BUSINESS_UNIT_ID = :bu
                 FETCH FIRST 1 ROW ONLY`,
                { term: `%${articleType}%`, bu: CONFIG.businessUnitId },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            if (matchResult.rows.length > 0) {
                const match = matchResult.rows[0];
                await conn.execute(
                    `UPDATE ATTR_MGR.LANDING_FASHION_HIERARCHY_MAP SET
                        TARGET_DEPT_ID = :dept,
                        TARGET_CLASS_ID = :class,
                        TARGET_SUB_CLASS_ID = :subclass,
                        MAPPING_STATUS = 'MAPPED',
                        MAPPING_METHOD = 'EXACT_DESCR',
                        UPDATED_AT = CURRENT_TIMESTAMP
                     WHERE MAP_ID = :id`,
                    {
                        dept: match.DEPT_ID,
                        class: match.CLASS_ID,
                        subclass: match.SUB_CLASS_ID,
                        id: row.MAP_ID
                    }
                );
                mappedCount++;
            } else {
                // Try searching for SUB_CATEGORY if ARTICLE_TYPE fails
                const subMatchResult = await conn.execute(
                    `SELECT DEPT_ID, CLASS_ID, SUB_CLASS_ID
                     FROM ATTR_MGR.HIERARCHY_CACHE
                     WHERE UPPER(CLASS_DESCR) LIKE UPPER(:term)
                       AND BUSINESS_UNIT_ID = :bu
                     FETCH FIRST 1 ROW ONLY`,
                    { term: `%${subCategory}%`, bu: CONFIG.businessUnitId },
                    { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );

                if (subMatchResult.rows.length > 0) {
                    const match = subMatchResult.rows[0];
                    await conn.execute(
                        `UPDATE ATTR_MGR.LANDING_FASHION_HIERARCHY_MAP SET
                            TARGET_DEPT_ID = :dept,
                            TARGET_CLASS_ID = :class,
                            TARGET_SUB_CLASS_ID = :subclass,
                            MAPPING_STATUS = 'MAPPED',
                            MAPPING_METHOD = 'SUB_CAT_MATCH',
                            UPDATED_AT = CURRENT_TIMESTAMP
                         WHERE MAP_ID = :id`,
                        {
                            dept: match.DEPT_ID,
                            class: match.CLASS_ID,
                            subclass: match.SUB_CLASS_ID,
                            id: row.MAP_ID
                        }
                    );
                    mappedCount++;
                }
            }
        }

        await conn.commit();
        console.log(`✅ Mapping Complete! Successfully mapped ${mappedCount} of ${pendingResult.rows.length} hierarchies.`);

    } catch (err) {
        console.error('❌ Mapping Failed:', err);
    } finally {
        if (conn) await conn.close();
    }
}

mapHierarchies();
