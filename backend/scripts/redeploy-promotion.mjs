import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function fix() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    const spec = `
CREATE OR REPLACE PACKAGE ATTR_MGR.PROMOTION_PKG AS
    PROCEDURE promote_draft(
        p_session_id    IN  NUMBER,
        p_username      IN  VARCHAR2 DEFAULT 'ATTR_MGR',
        p_job_id        OUT NUMBER,
        p_status        OUT VARCHAR2,
        p_error_msg     OUT VARCHAR2
    );
END PROMOTION_PKG;
`;
    await conn.execute(spec);
    
    const body = `
CREATE OR REPLACE PACKAGE BODY ATTR_MGR.PROMOTION_PKG AS

    PROCEDURE promote_draft(
        p_session_id    IN  NUMBER,
        p_username      IN  VARCHAR2,
        p_job_id        OUT NUMBER,
        p_status        OUT VARCHAR2,
        p_error_msg     OUT VARCHAR2
    ) IS
        v_draft         ATTR_MGR.STAGING_STYLES%ROWTYPE;
        v_job_id        NUMBER;
        v_style_id      VARCHAR2(14);
    BEGIN
        SAVEPOINT start_promotion;
        
        -- [1] FETCH DRAFT HEADER
        BEGIN
            SELECT * INTO v_draft FROM ATTR_MGR.STAGING_STYLES WHERE SESSION_ID = p_session_id;
        EXCEPTION WHEN NO_DATA_FOUND THEN
            p_status := 'ERROR';
            p_error_msg := 'Session ' || p_session_id || ' not found.';
            RETURN;
        END;
        
        -- [2] PREFLIGHT VALIDATION
        IF v_draft.COMPLETION_PCT < 100 THEN
            p_status := 'ERROR';
            p_error_msg := 'Incomplete Draft: ' || v_draft.COMPLETION_PCT || '%';
            RETURN;
        END IF;

        -- [3] IDENTITY GENERATION
        -- Pattern: YYYYMMDD + SESSION_ID (Guarantees uniqueness across parallel users)
        v_job_id := TO_NUMBER(TO_CHAR(SYSDATE, 'YYYYMMDD') || p_session_id);
        v_style_id := NVL(v_draft.STYLE_ID, v_draft.VENDOR_STYLE_NO);
        
        -- [4] PROMOTE TO IRI TABLES (ERP GATEWAY)
        
        -- 4.1 Header (IRI_WHSLE_STYLES)
        INSERT INTO ATTR_MGR.IRI_WHSLE_STYLES (
            BUSINESS_UNIT_ID, JOB_ID, STYLE_ID, VENDOR_ID,
            DESCRIPTION, STATUS, PROCESS_STATUS, CREATED_BY
        ) VALUES (
            v_draft.BUSINESS_UNIT_ID, v_job_id, v_style_id, v_draft.VENDOR_ID,
            v_draft.SHORT_DESCRIPTION, 'Y', 'N', p_username
        );

        -- 4.2 Characteristics (IRI_WHSLE_STYLE_CHARACTERISTIC)
        INSERT INTO ATTR_MGR.IRI_WHSLE_STYLE_CHARACTERISTIC (
            BUSINESS_UNIT_ID, JOB_ID, STYLE_ID,
            STYLE_CHAR_SUB_TYPE, CHARACTERISTIC_TYPE_ID, CHARACTERISTIC_VALUE_ID,
            CHAR_VALUE_DESCRIPTION, CREATED_BY, STATUS, PROCESS_STATUS
        )
        SELECT 
            v_draft.BUSINESS_UNIT_ID, v_job_id, v_style_id,
            'STYL', CHARACTERISTIC_TYPE_ID, CHARACTERISTIC_VALUE_ID,
            NULL, p_username, 'Y', 'N'
        FROM ATTR_MGR.STAGING_STYLE_CHARACTERISTICS
        WHERE SESSION_ID = p_session_id;

        -- 4.3 Descriptions (IRI_WHSLE_STYLE_FOREIGN_DESC)
        IF v_draft.LONG_DESCRIPTION IS NOT NULL THEN
            INSERT INTO ATTR_MGR.IRI_WHSLE_STYLE_FOREIGN_DESC (
                BUSINESS_UNIT_ID, JOB_ID, STYLE_ID, LANGUAGE_ID,
                DESCRIPTION, WEB_DESCRIPTION, LONG_DESCRIPTION,
                CREATED_BY, STATUS, PROCESS_STATUS
            ) VALUES (
                v_draft.BUSINESS_UNIT_ID, v_job_id, v_style_id, 'ENG',
                v_draft.SHORT_DESCRIPTION, v_draft.LONG_DESCRIPTION, v_draft.LONG_DESCRIPTION,
                p_username, 'Y', 'N'
            );
        END IF;

        -- [5] MARK STAGING AS PROMOTED
        UPDATE ATTR_MGR.STAGING_STYLES 
        SET DRAFT_STATUS = 'PROMOTED',
            PROMOTED_AT = CURRENT_TIMESTAMP,
            IRI_JOB_ID = v_job_id,
            STYLE_ID = v_style_id
        WHERE SESSION_ID = p_session_id;

        p_job_id := v_job_id;
        p_status := 'SUCCESS';
        COMMIT;

    EXCEPTION WHEN OTHERS THEN
        ROLLBACK TO start_promotion;
        p_status := 'ERROR';
        p_error_msg := '[PROMOTION_CRASH]: ' || SQLERRM;
        LOGGER_PKG.log_error(p_error_msg, 'PROMOTION', DBMS_UTILITY.FORMAT_ERROR_BACKTRACE);
    END promote_draft;

END PROMOTION_PKG;
`;
    await conn.execute(body);
    await conn.commit();
    console.log('✅ PROMOTION_PKG redeployed successfully.');

  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

fix();

