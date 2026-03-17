import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    
    const styleId = '20183648';
    
    // Check JDS
    const jdsRes = await conn.execute(
      `SELECT COUNT(*) FROM STYLE_IMAGES@MERCH_JDS_LNK WHERE style_id = :styleId`,
      { styleId }
    );
    console.log(`Style ${styleId} in JDS: ${jdsRes.rows[0][0]} images`);

    // Check HRI
    const hriRes = await conn.execute(
      `SELECT COUNT(*) FROM STYLE_IMAGES@MERCH_HRI_LNK WHERE style_id = :styleId`,
      { styleId }
    );
    console.log(`Style ${styleId} in HRI: ${hriRes.rows[0][0]} images`);

  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

