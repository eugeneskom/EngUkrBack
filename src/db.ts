import { Pool } from 'pg';

const pool = new Pool({
  user: 'postgres',
  host: '192.168.0.106',
  database: 'engukrdb',
  password: '85rk9521',
  port: 5432,
});

export default pool;