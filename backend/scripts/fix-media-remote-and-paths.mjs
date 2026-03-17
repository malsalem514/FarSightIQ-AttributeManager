import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function update() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    console.log('Updating FETCH_REMOTE_IMAGE to support OCI and VCP19QA...');
    
    const sql = `
CREATE OR REPLACE PROCEDURE ATTR_MGR.FETCH_REMOTE_IMAGE (
    p_tenant_id IN VARCHAR2,
    p_image_name IN VARCHAR2
) AS
BEGIN
    -- 1. Cleanup old proxy entries (TTL 24 hours to be safer)
    DELETE FROM ATTR_MGR.IMAGE_PROXY_CACHE 
    WHERE FETCHED_DATE < SYSDATE - 1;
    
    -- 2. Check local existence
    DECLARE
        v_exists NUMBER;
    BEGIN
        SELECT COUNT(*) INTO v_exists FROM ATTR_MGR.IMAGE_PROXY_CACHE WHERE IMAGE_NAME = p_image_name;
        IF v_exists > 0 THEN
            RETURN;
        END IF;
    END;

    -- 3. Materialize remote BLOB locally (The ORA-22992 Fix)
    IF p_tenant_id = 'HRI_MPRD' THEN
        INSERT INTO ATTR_MGR.IMAGE_PROXY_CACHE (IMAGE_NAME, BLOB_DATA, TENANT_ID)
        SELECT p_image_name, IMAGE_BLOB, p_tenant_id
        FROM IMAGES@MERCH_HRI_LNK
        WHERE ORIGINAL_NAME = p_image_name AND ROWNUM = 1;
    ELSIF p_tenant_id = 'JDS_MPRD' THEN
        INSERT INTO ATTR_MGR.IMAGE_PROXY_CACHE (IMAGE_NAME, BLOB_DATA, TENANT_ID)
        SELECT p_image_name, IMAGE_BLOB, p_tenant_id
        FROM IMAGES@MERCH_JDS_LNK
        WHERE ORIGINAL_NAME = p_image_name AND ROWNUM = 1;
    ELSIF p_tenant_id = 'OCI' THEN
        INSERT INTO ATTR_MGR.IMAGE_PROXY_CACHE (IMAGE_NAME, BLOB_DATA, TENANT_ID)
        SELECT p_image_name, IMAGE_BLOB, p_tenant_id
        FROM IMAGES@MERCH_OCI_LNK
        WHERE ORIGINAL_NAME = p_image_name AND ROWNUM = 1;
    ELSIF p_tenant_id = 'VCP19QA' THEN
        INSERT INTO ATTR_MGR.IMAGE_PROXY_CACHE (IMAGE_NAME, BLOB_DATA, TENANT_ID)
        SELECT p_image_name, IMAGE_BLOB, p_tenant_id
        FROM IMAGES@MERCH_VCP19QA_LNK
        WHERE ORIGINAL_NAME = p_image_name AND ROWNUM = 1;
    END IF;
    
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        -- Fail silently to allow backend to handle missing image
END;
`;
    await conn.execute(sql);
    console.log('✅ FETCH_REMOTE_IMAGE updated.');

    console.log('Updating APP_ENVIRONMENTS to use relative image paths...');
    await conn.execute(
      "UPDATE ATTR_MGR.APP_ENVIRONMENTS SET IMAGE_BASE_URL = '/api/images/'"
    );
    await conn.commit();
    console.log('✅ APP_ENVIRONMENTS updated.');

  } catch(e) {
    console.error(e);
  } finally {
    if(conn) await conn.close();
  }
}

update();

