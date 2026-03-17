import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    
    const styles = ['20183648', '20183685', '20183669', '20183631', '20183638', '20183637', '20183636'];
    
    for (const styleId of styles) {
      const res = await conn.execute(
        `SELECT COUNT(*) FROM STYLE_IMAGES WHERE style_id = :styleId`,
        { styleId }
      );
      console.log(`Style ${styleId}: ${res.rows[0][0]} images`);
    }

  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

