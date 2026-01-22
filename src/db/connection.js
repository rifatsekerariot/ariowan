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
 * Check if required tables exist in the database using information_schema
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
    const tableCount = result.rows.length;
    const allTablesExist = tableCount === 3;
    
    if (allTablesExist) {
      logger.debug('All required tables exist', {
        tables: result.rows.map(r => r.table_name),
      });
    } else {
      logger.info('Required tables missing', {
        found: tableCount,
        expected: 3,
        tables: result.rows.map(r => r.table_name),
      });
    }
    
    return allTablesExist;
  } catch (error) {
    logger.error('Error checking tables existence', error);
    throw error;
  }
}

/**
 * Parse schema.sql file into executable statements
 * Handles PostgreSQL $$ delimiters for function bodies
 * @param {string} schemaSQL - Raw SQL content
 * @returns {Array<string>} Array of SQL statements
 */
function parseSchemaStatements(schemaSQL) {
  const statements = [];
  let currentStatement = '';
  let inDollarQuote = false;
  let dollarTag = '';
  let i = 0;

  while (i < schemaSQL.length) {
    const char = schemaSQL[i];
    const nextChar = schemaSQL[i + 1] || '';

    // Detect start of dollar-quoted string ($$ or $tag$)
    if (char === '$' && !inDollarQuote) {
      let tag = '$';
      let j = i + 1;
      while (j < schemaSQL.length && schemaSQL[j] !== '$') {
        tag += schemaSQL[j];
        j++;
      }
      if (j < schemaSQL.length) {
        tag += '$';
        dollarTag = tag;
        inDollarQuote = true;
        currentStatement += char;
        i++;
        continue;
      }
    }

    // Detect end of dollar-quoted string
    if (inDollarQuote && schemaSQL.substring(i).startsWith(dollarTag)) {
      currentStatement += dollarTag;
      i += dollarTag.length;
      inDollarQuote = false;
      dollarTag = '';
      continue;
    }

    currentStatement += char;

    // Detect statement end (semicolon outside dollar quotes)
    if (!inDollarQuote && char === ';') {
      const trimmed = currentStatement.trim();
      // Skip empty statements and comments
      if (trimmed.length > 0 && !trimmed.startsWith('--')) {
        statements.push(trimmed);
      }
      currentStatement = '';
    }

    i++;
  }

  // Add final statement if exists
  const trimmed = currentStatement.trim();
  if (trimmed.length > 0 && !trimmed.startsWith('--')) {
    statements.push(trimmed);
  }

  return statements.filter(s => s.length > 0);
}

/**
 * Load schema from schema.sql file
 * Executes all statements and aborts on any error
 * @returns {Promise<void>}
 * @throws {Error} If any SQL statement fails
 */
async function loadSchema() {
  const schemaPath = path.join(__dirname, '../../database/schema.sql');
  
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}`);
  }

  const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
  const statements = parseSchemaStatements(schemaSQL);
  
  if (statements.length === 0) {
    throw new Error('No SQL statements found in schema file');
  }

  logger.info('Loading database schema', {
    statements: statements.length,
    schemaPath: schemaPath,
  });

  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  // Execute statements sequentially
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    const statementNum = i + 1;

    try {
      await query(statement);
      successCount++;
      logger.debug(`Schema statement ${statementNum}/${statements.length} executed successfully`);
    } catch (err) {
      errorCount++;
      const errorInfo = {
        statement: statementNum,
        total: statements.length,
        error: err.message,
        code: err.code,
        sql: statement.substring(0, 200), // First 200 chars for logging
      };

      // Check if error is acceptable (already exists for IF NOT EXISTS)
      const isAcceptableError = 
        err.message.includes('already exists') ||
        err.message.includes('duplicate key') ||
        err.code === '42P07' || // duplicate_table
        err.code === '42710';   // duplicate_object

      if (isAcceptableError) {
        logger.debug(`Schema statement ${statementNum} skipped (already exists)`, {
          code: err.code,
        });
        successCount++; // Count as success for IF NOT EXISTS
      } else {
        // Real error - abort
        errors.push(errorInfo);
        logger.error(`Schema statement ${statementNum} failed`, errorInfo);
        
        // Abort on first real error
        throw new Error(
          `Schema loading failed at statement ${statementNum}/${statements.length}: ${err.message}`
        );
      }
    }
  }

  // Only log success if no errors occurred
  if (errorCount === 0 || errors.length === 0) {
    logger.info('Database schema loaded successfully', {
      statements: successCount,
    });
  } else {
    // This should not happen due to throw above, but just in case
    throw new Error(
      `Schema loading completed with errors: ${errors.length} failed statements`
    );
  }
}

/**
 * Initialize database: check tables and load schema if needed
 * Loads schema only once if tables don't exist
 * Aborts startup on any SQL error
 * @returns {Promise<void>}
 * @throws {Error} If initialization fails
 */
async function initializeDatabase() {
  try {
    // Check if tables exist using information_schema
    const tablesExistResult = await tablesExist();
    
    if (!tablesExistResult) {
      logger.info('Required tables not found, loading schema...');
      await loadSchema();
      
      // Verify tables were created
      const verifyResult = await tablesExist();
      if (!verifyResult) {
        throw new Error(
          'Schema loading completed but required tables still missing. ' +
          'Check schema.sql for errors.'
        );
      }
      
      logger.info('Database schema initialized successfully');
    } else {
      logger.info('Database tables already exist, skipping schema load');
    }
  } catch (error) {
    logger.error('Database initialization failed', {
      error: error.message,
      stack: error.stack,
    });
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
  // Expose tablesExist for health checks
};
