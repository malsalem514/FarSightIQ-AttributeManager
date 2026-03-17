import oracledb from 'oracledb';

const config = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1',
};

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function main() {
  const conn = await oracledb.getConnection(config);
  
  const res = await conn.execute(`
    SELECT column_name, data_type, nullable
    FROM user_tab_columns 
    WHERE table_name = 'CHARACTERISTIC_HIERARCHY_RULES' 
    ORDER BY column_id
  `);
  
  console.log('\nCHARACTERISTIC_HIERARCHY_RULES columns:\n');
  console.table(res.rows);
  
  await conn.close();
}

main().catch(console.error);

