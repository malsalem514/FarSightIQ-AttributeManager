import oracledb from 'oracledb';
import { config } from '../dist/config.js';

async function check() {
  let conn;
  try {
    conn = await oracledb.getConnection(config.oracle);
    const res = await conn.execute(
      `SELECT line, position, text FROM user_errors WHERE name = 'PROMOTION_PKG' AND type = 'PACKAGE BODY' ORDER BY sequence`
    );
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
}

check();

