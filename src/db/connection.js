const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
require('dotenv').config();

// Database configuration from environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'rf_analytics',
  user: process.env.DB_USER || 'rf_user',
  password: process.env.DB_PASSWORD || '',
  // Connection pool settings (production-grade)
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '2000', 10),
  // Statement timeout (prevent long-running queries)
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10), // 30 seconds
  // Query timeout
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000', 10), // 30 seconds
};

// Create connection pool
const pool = new Pool(dbConfig);

// Handle pool errors (don't exit, just log)
pool.on('error', (err, client) => {
  logger.error('Unexpected error on idle database client', {
    error: err.message,
    stack: err.stack,
    client: client ? 'active' : 'idle',
  });
  // Don't exit on pool errors - let the application handle it
});

// Monitor pool connections
pool.on('connect', (client) => {
  logger.debug('New database client connected', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

pool.on('remove', (client) => {
  logger.debug('Database client removed from pool', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
  });
});

// Test connection on startup (with retry logic for Docker)
async function testConnection(retries = 10, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await pool.query('SELECT NOW()');
      logger.info('Database connected successfully', {
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        poolSize: `${dbConfig.min}-${dbConfig.max}`,
        databaseTime: result.rows[0].now,
      });
      return;
    } catch (err) {
      if (i === retries - 1) {
        logger.error('Database connection test failed after retries', err);
        process.exit(1);
      }
      logger.warn(`Database connection attempt ${i + 1}/${retries} failed, retrying...`, {
        error: err.message,
      });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Test connection (non-blocking for Docker startup)
testConnection().catch((err) => {
  logger.error('Database connection test error', err);
  process.exit(1);
});

/**
 * Execute a query with the connection pool
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise} Query result
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Log slow queries (configurable threshold)
    const slowQueryThreshold = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '100', 10);
    if (duration > slowQueryThreshold) {
      logger.warn('Slow query detected', {
        duration: `${duration}ms`,
        rows: res.rowCount,
        query: text.substring(0, 200), // First 200 chars
      });
    }
    
    return res;
  } catch (error) {
    logger.error('Database query error', {
      error: error.message,
      code: error.code,
      query: text.substring(0, 200),
    });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise<pg.Client>} Database client
 */
async function getClient() {
  return await pool.connect();
}

/**
 * Check if tables exist in the database
 * @returns {Promise<boolean>} True if all required tables exist
 */
async function tablesExist() {
  try {
    const result = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('gateways', 'devices', 'uplinks')
    `);
    return result.rows.length === 3;
  } catch (error) {
    console.error('Error checking tables:', error);
    return false;
  }
}

/**
 * Load schema from schema.sql file
 * @returns {Promise<void>}
 */
async function loadSchema() {
  try {
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    
    // Split by semicolons and execute each statement
    // Remove comments and empty lines
    const statements = schemaSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    logger.info(`Loading schema: ${statements.length} statements`);
    
    // Execute statements sequentially
    for (const statement of statements) {
      if (statement.trim().length > 0) {
        try {
          await query(statement);
        } catch (err) {
          // Ignore "already exists" errors for CREATE IF NOT EXISTS
          if (!err.message.includes('already exists') && 
              !err.message.includes('duplicate key')) {
            logger.warn('Schema statement warning', {
              error: err.message,
              statement: statement.substring(0, 100),
            });
          }
        }
      }
    }
    
    logger.info('Schema loaded successfully');
  } catch (error) {
    console.error('Error loading schema:', error);
    throw error;
  }
}

/**
 * Initialize database: check tables and load schema if needed
 * @returns {Promise<void>}
 */
async function initializeDatabase() {
  try {
    const exist = await tablesExist();
    if (!exist) {
      logger.info('Tables do not exist, loading schema...');
      await loadSchema();
    } else {
      logger.info('Tables already exist, skipping schema load');
    }
  } catch (error) {
    logger.error('Database initialization error', error);
    throw error;
  }
}

/**
 * Close the connection pool gracefully
 * Waits for active queries to complete before closing
 * @returns {Promise<void>}
 */
async function close() {
  try {
    logger.info('Closing database connection pool', {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    });
    
    await pool.end();
    logger.info('Database connection pool closed');
  } catch (error) {
    logger.error('Error closing database connection pool', error);
    throw error;
  }
}

module.exports = {
  pool,
  query,
  getClient,
  tablesExist,
  loadSchema,
  initializeDatabase,
  close,
};
