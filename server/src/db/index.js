import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

// Use DATABASE_URL if available (recommended for Supabase), otherwise use individual vars
let poolConfig;

if (process.env.DATABASE_URL) {
  // Parse DATABASE_URL for Supabase connection
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  };
} else {
  // Determine if we need SSL (Supabase requires it)
  const isSupabase = process.env.DB_HOST?.includes('supabase') || process.env.DB_HOST?.includes('pooler');
  const sslConfig = isSupabase ? { rejectUnauthorized: false } : false;

  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: sslConfig,
  };
}

// Database connection pool
const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Execute a database query
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<pg.QueryResult>} Query result
 */
export const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('Executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
  }
  return res;
};

/**
 * Get a client from the pool for transactions
 * @returns {Promise<pg.PoolClient>} Pool client
 */
export const getClient = () => pool.connect();

/**
 * Execute a transaction with multiple queries
 * @param {Function} callback - Callback function that receives client
 * @returns {Promise<any>} Transaction result
 */
export const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

export default pool;
