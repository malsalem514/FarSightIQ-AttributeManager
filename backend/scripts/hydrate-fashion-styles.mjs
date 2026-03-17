import oracledb from 'oracledb';

// Configuration
const CONFIG = {
    oracle: {
        user: 'system',
        password: 'OraclePass123',
        connectString: 'localhost:1521/FREEPDB1'
    },
    businessUnitId: 1,
    vendorId: 'TEST_VEND',
    batchSize: 500
};

async function hydrateStyles() {
    let conn;
    try {
        console.log('🚀 Starting Style Hydration (Tier 3)...');
        conn = await oracledb.getConnection(CONFIG.oracle);
        
        // 1. Generate a unique Job ID
        const jobResult = await conn.execute(
            `SELECT TO_NUMBER(TO_CHAR(SYSTIMESTAMP, 'YYMMDDHH24MI')) as JOB_ID FROM DUAL`
        );
        const jobId = jobResult.rows[0][0];
        console.log(`📦 Assigned JOB_ID: ${jobId}`);

        // 2. Fetch records to hydrate
        // Joining Landing with Hierarchy Map
        const sourceResult = await conn.execute(
            `SELECT L.DATASET_ID, L.DISPLAY_NAME, 
                    M.TARGET_DEPT_ID, M.TARGET_CLASS_ID, M.TARGET_SUB_CLASS_ID
             FROM ATTR_MGR.LANDING_FASHION_DATASET L
             JOIN ATTR_MGR.LANDING_FASHION_HIERARCHY_MAP M 
               ON L.MASTER_CATEGORY = M.MASTER_CATEGORY 
              AND L.SUB_CATEGORY = M.SUB_CATEGORY 
              AND L.ARTICLE_TYPE = M.ARTICLE_TYPE
             WHERE L.INGESTION_STATUS = 'PENDING'
               AND M.MAPPING_STATUS = 'MAPPED'`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        console.log(`🔍 Found ${sourceResult.rows.length} records ready for hydration.`);

        if (sourceResult.rows.length === 0) {
            console.log('✨ No records to process. Check mapping status.');
            return;
        }

        const insertSql = `
            INSERT INTO ATTR_MGR.IRI_WHSLE_STYLES (
                BUSINESS_UNIT_ID, JOB_ID, STYLE_ID, VENDOR_ID,
                DEPARTMENT_ID, CLASS_ID, SUB_CLASS_ID,
                DESCRIPTION, STATUS, PROCESS_STATUS, CREATED_BY
            ) VALUES (
                :1, :2, ATTR_MGR.SEQ_FASHION_STYLE_ID.NEXTVAL, :3,
                :4, :5, :6,
                :7, 'Y', 'N', 'HYDRATION_AGENT'
            )
        `;

        let totalHydrated = 0;
        let batch = [];

        for (const row of sourceResult.rows) {
            // Trim description to 30 chars
            const cleanDesc = (row.DISPLAY_NAME || 'New Style').substring(0, 30);

            batch.push([
                CONFIG.businessUnitId,
                jobId,
                CONFIG.vendorId,
                row.TARGET_DEPT_ID,
                row.TARGET_CLASS_ID,
                row.TARGET_SUB_CLASS_ID,
                cleanDesc
            ]);

            if (batch.length >= CONFIG.batchSize) {
                const result = await conn.executeMany(insertSql, batch);
                totalHydrated += result.rowsAffected;
                console.log(`📦 Hydrated ${totalHydrated} records...`);
                batch = [];
                await conn.commit();
            }
        }

        if (batch.length > 0) {
            const result = await conn.executeMany(insertSql, batch);
            totalHydrated += result.rowsAffected;
            await conn.commit();
        }

        // 3. Mark records as INGESTED in Landing table
        console.log('🔄 Updating landing status...');
        await conn.execute(
            `UPDATE ATTR_MGR.LANDING_FASHION_DATASET L
             SET INGESTION_STATUS = 'INGESTED'
             WHERE INGESTION_STATUS = 'PENDING'
               AND EXISTS (
                 SELECT 1 FROM ATTR_MGR.LANDING_FASHION_HIERARCHY_MAP M 
                 WHERE L.MASTER_CATEGORY = M.MASTER_CATEGORY 
                   AND L.SUB_CATEGORY = M.SUB_CATEGORY 
                   AND L.ARTICLE_TYPE = M.ARTICLE_TYPE
                   AND M.MAPPING_STATUS = 'MAPPED'
               )`
        );
        await conn.commit();

        console.log(`\n✨ HYDRATION COMPLETE!`);
        console.log(`📊 Total records hydrated to IRI: ${totalHydrated}`);
        console.log(`📝 Use JOB_ID ${jobId} to check progress in IRI_WHSLE_STYLES.`);

    } catch (err) {
        console.error('❌ Hydration Failed:', err);
    } finally {
        if (conn) await conn.close();
    }
}

hydrateStyles();
