import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    
    console.log('Finding styles in HRI BU 1 that HAVE images...');
    const res = await conn.execute(
      `SELECT si.style_id, s.description 
       FROM STYLE_IMAGES si
       JOIN STYLES s ON s.style_id = si.style_id AND s.business_unit_id = si.business_unit_id
       WHERE si.business_unit_id = 1 AND ROWNUM <= 10`
    );
    console.table(res.rows);

  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

