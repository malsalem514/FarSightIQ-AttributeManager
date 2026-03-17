import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function fix() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    console.log('🛠️  Updating REFRESH_CATALOG_MEDIA to use dynamic base URL...');

    const plsql = `
CREATE OR REPLACE PROCEDURE ATTR_MGR.REFRESH_CATALOG_MEDIA(
    p_tenant_id IN VARCHAR2,
    p_bu_id     IN NUMBER
) AUTHID CURRENT_USER AS
    v_base_url VARCHAR2(500);
    v_sql VARCHAR2(32000);
BEGIN
    -- Step 0: Get Base URL from Registry
    BEGIN
        SELECT IMAGE_BASE_URL INTO v_base_url 
        FROM ATTR_MGR.APP_ENVIRONMENTS 
        WHERE env_id = p_tenant_id;
    EXCEPTION WHEN NO_DATA_FOUND THEN
        v_base_url := '/api/images/'; -- Default to local proxy
    END;

    -- Step 1: Clear local staging
    DELETE FROM ATTR_MGR.STYLE_IMAGE_STAGING 
    WHERE TENANT_ID = p_tenant_id AND BUSINESS_UNIT_ID = p_bu_id;

    -- Step 2: Pass 1 (PRIMARY)
    v_sql := 'INSERT INTO ATTR_MGR.STYLE_IMAGE_STAGING (TENANT_ID, BUSINESS_UNIT_ID, STYLE_ID, IMG_URL, IMAGE_TYPE)
    SELECT :tenant, :bu, si.STYLE_ID, :base_url || MIN(i.ORIGINAL_NAME), si.TYPE
    FROM STYLE_IMAGES si
    JOIN CENTRAL_IMAGES i ON i.IMAGE_ID = si.IMAGE_ID
    WHERE si.BUSINESS_UNIT_ID = :bu AND si.TYPE = ''PRIMARY''
    GROUP BY si.STYLE_ID, si.TYPE';
    
    BEGIN
        EXECUTE IMMEDIATE v_sql USING p_tenant_id, p_bu_id, v_base_url, p_bu_id;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Step 3: Pass 2 (DEFAULT)
    v_sql := 'INSERT INTO ATTR_MGR.STYLE_IMAGE_STAGING (TENANT_ID, BUSINESS_UNIT_ID, STYLE_ID, IMG_URL, IMAGE_TYPE)
    SELECT :tenant, :bu, si.STYLE_ID, :base_url || MIN(i.ORIGINAL_NAME), si.TYPE
    FROM STYLE_IMAGES si
    JOIN CENTRAL_IMAGES i ON i.IMAGE_ID = si.IMAGE_ID
    WHERE si.BUSINESS_UNIT_ID = :bu AND si.TYPE = ''DEFAULT''
      AND NOT EXISTS (SELECT 1 FROM ATTR_MGR.STYLE_IMAGE_STAGING s 
                      WHERE s.TENANT_ID = :tenant AND s.BUSINESS_UNIT_ID = :bu AND s.STYLE_ID = si.STYLE_ID)
    GROUP BY si.STYLE_ID, si.TYPE';
    
    BEGIN
        EXECUTE IMMEDIATE v_sql USING p_tenant_id, p_bu_id, v_base_url, p_bu_id, p_tenant_id, p_bu_id;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Step 4: Final Merge to Shadow Cache
    MERGE INTO ATTR_MGR.CATALOG_CACHE_SHADOW target
    USING (
        SELECT STYLE_ID, IMG_URL, IMAGE_TYPE
        FROM ATTR_MGR.STYLE_IMAGE_STAGING
        WHERE TENANT_ID = p_tenant_id AND BUSINESS_UNIT_ID = p_bu_id
    ) source
    ON (target.TENANT_ID = p_tenant_id AND target.BUSINESS_UNIT_ID = p_bu_id AND target.STYLE_ID = source.STYLE_ID)
    WHEN MATCHED THEN UPDATE SET 
        target.HAS_IMAGE_IND = 'Y',
        target.IMAGE_URLS_JSON = '[{"url":"' || source.IMG_URL || '","type":"' || source.IMAGE_TYPE || '","view":"1","source":"STYLE"}]';

    COMMIT;
END;
    `;

    await conn.execute(plsql);
    console.log('✅ REFRESH_CATALOG_MEDIA updated.');

    // Step 5: Update OCI environment base URL to use the proxy
    await conn.execute(
      "UPDATE ATTR_MGR.APP_ENVIRONMENTS SET IMAGE_BASE_URL = 'http://localhost:3002/api/images/' WHERE env_id IN ('OCI', 'QA', 'DEV', 'VCP19QA')"
    );
    console.log('✅ Updated IMAGE_BASE_URL for non-prod environments.');

    await conn.commit();

    // Step 6: Trigger a media refresh for OCI
    console.log('🔄 Refreshing OCI media...');
    await conn.execute("BEGIN ATTR_MGR.REFRESH_CATALOG_MEDIA('OCI', 1); END;");
    console.log('✅ OCI media refreshed.');

  } catch (e) {
    console.error('❌ Fix Failed:', e.message);
  } finally {
    if (conn) await conn.close();
  }
}

fix();

