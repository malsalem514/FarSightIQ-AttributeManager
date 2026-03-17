import oracledb from 'oracledb';

// Configuration
const CONFIG = {
    oracle: {
        user: 'system',
        password: 'OraclePass123',
        connectString: 'localhost:1521/FREEPDB1'
    },
    businessUnitId: 1,
    vendorId: 'TEST_VEND'
};

async function hydrateSingleStyle() {
    let conn;
    try {
        console.log('🚀 Starting SINGLE Style Hydration Test...');
        conn = await oracledb.getConnection(CONFIG.oracle);
        
        // 1. Generate a unique Job ID
        const jobResult = await conn.execute(
            `SELECT TO_NUMBER(TO_CHAR(SYSTIMESTAMP, 'YYMMDDHH24MI')) as JOB_ID FROM DUAL`
        );
        const jobId = jobResult.rows[0][0];
        console.log(`📦 Assigned JOB_ID: ${jobId}`);

        // 2. Fetch exactly 1 record to hydrate
        const sourceResult = await conn.execute(
            `SELECT L.DATASET_ID, L.DISPLAY_NAME, 
                    M.TARGET_DEPT_ID, M.TARGET_CLASS_ID, M.TARGET_SUB_CLASS_ID
             FROM ATTR_MGR.LANDING_FASHION_DATASET L
             JOIN ATTR_MGR.LANDING_FASHION_HIERARCHY_MAP M 
               ON L.MASTER_CATEGORY = M.MASTER_CATEGORY 
              AND L.SUB_CATEGORY = M.SUB_CATEGORY 
              AND L.ARTICLE_TYPE = M.ARTICLE_TYPE
             WHERE L.INGESTION_STATUS = 'PENDING'
               AND M.MAPPING_STATUS = 'MAPPED'
             FETCH FIRST 1 ROW ONLY`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (sourceResult.rows.length === 0) {
            console.log('❌ No records found ready for hydration.');
            return;
        }

        const row = sourceResult.rows[0];
        const styleIdResult = await conn.execute(`SELECT ATTR_MGR.SEQ_FASHION_STYLE_ID.NEXTVAL FROM DUAL`);
        const styleId = styleIdResult.rows[0][0];
        
        const cleanDesc = (row.DISPLAY_NAME || 'Test Style').substring(0, 30);

        console.log(`📝 Processing Style: ${cleanDesc} (Dataset ID: ${row.DATASET_ID})`);
        console.log(`🆔 Generated Style ID: ${styleId}`);

        const insertSql = `
            INSERT INTO ATTR_MGR.IRI_WHSLE_STYLES (
                BUSINESS_UNIT_ID, JOB_ID, STYLE_ID, VENDOR_ID,
                DEPARTMENT_ID, CLASS_ID, SUB_CLASS_ID,
                DESCRIPTION, STATUS, PROCESS_STATUS, CREATED_BY
            ) VALUES (
                :1, :2, :3, :4, :5, :6, :7, :8, 'Y', 'N', 'TEST_AGENT'
            )
        `;

        await conn.execute(insertSql, [
            CONFIG.businessUnitId,
            jobId,
            styleId,
            CONFIG.vendorId,
            row.TARGET_DEPT_ID,
            row.TARGET_CLASS_ID,
            row.TARGET_SUB_CLASS_ID,
            cleanDesc
        ]);

        // Update landing status
        await conn.execute(
            `UPDATE ATTR_MGR.LANDING_FASHION_DATASET 
             SET INGESTION_STATUS = 'INGESTED',
                 STYLE_ID_NUMERIC = :styleId
             WHERE DATASET_ID = :datasetId`,
            { styleId: styleId, datasetId: row.DATASET_ID }
        );

        await conn.commit();

        console.log(`\n✅ TEST SUCCESSFUL!`);
        console.log(`📊 1 style hydrated to IRI with JOB_ID ${jobId}.`);

    } catch (err) {
        console.error('❌ Test Failed:', err);
    } finally {
        if (conn) await conn.close();
    }
}

hydrateSingleStyle();
