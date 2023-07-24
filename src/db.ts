import { Pool } from 'pg';

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'engukrdb',
  password: '85rk9521',
  port: 5432,
});

export default pool;