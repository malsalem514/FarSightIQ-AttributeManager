import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    
    const styleId = '20183648';
    
    console.log(`Checking Remote HRI STYLE_IMAGES for style ${styleId}...`);
    
    // Check STYLE_IMAGES
    const res = await conn.execute(
      `SELECT * FROM STYLE_IMAGES WHERE STYLE_ID = :styleId`,
      { styleId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('Remote STYLE_IMAGES rows:', res.rows);

    if (res.rows.length > 0) {
      const imageId = res.rows[0].IMAGE_ID;
      console.log(`Checking CENTRAL_IMAGES for IMAGE_ID ${imageId}...`);
      const imgRes = await conn.execute(
        `SELECT * FROM CENTRAL_IMAGES WHERE IMAGE_ID = :imageId`,
        { imageId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      console.log('Remote CENTRAL_IMAGES rows:', imgRes.rows);
    } else {
      console.log('❌ No rows found in STYLE_IMAGES for this style.');
      
      // Try searching without synonym to be sure
      console.log('Trying direct link query...');
      const directRes = await conn.execute(
        `SELECT * FROM STYLE_IMAGES@MERCH_HRI_LNK WHERE STYLE_ID = :styleId`,
        { styleId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      console.log('Direct link query results:', directRes.rows);
    }

  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

