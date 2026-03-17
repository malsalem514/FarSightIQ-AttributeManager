import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    
    console.log('Checking for ANY styles with images in HRI...');
    
    const res = await conn.execute(
      `SELECT style_id FROM STYLE_IMAGES WHERE ROWNUM <= 10`
    );
    console.log('Sample styles with images in HRI:', res.rows);

    // Check count
    const countRes = await conn.execute(
      `SELECT COUNT(DISTINCT style_id) FROM STYLE_IMAGES`
    );
    console.log('Total styles with images in HRI:', countRes.rows[0][0]);

    // Check mapping
    const mapRes = await conn.execute(
      `SELECT table_name FROM all_synonyms WHERE synonym_name = 'CENTRAL_IMAGES'`
    );
    console.log('CENTRAL_IMAGES synonym points to:', mapRes.rows);

  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

