const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const logger = require('../utils/logger');

/**
 * GET /health
 * Health check endpoint
 * 
 * Returns:
 * - db_connected: true/false (database connection status)
 * - tables_ready: true/false (required tables exist)
 * 
 * Used by Docker healthcheck to determine container health
 */
router.get('/health', async (req, res) => {
  let dbConnected = false;
  let tablesReady = false;
  
  try {
    // Test database connection
    try {
      await db.query('SELECT 1');
      dbConnected = true;
    } catch (error) {
      logger.warn('Health check: Database connection failed', {
        error: error.message,
      });
      dbConnected = false;
    }
    
    // Check if tables exist (only if DB is connected)
    if (dbConnected) {
      try {
        tablesReady = await db.tablesExist();
      } catch (error) {
        logger.warn('Health check: Table check failed', {
          error: error.message,
        });
        tablesReady = false;
      }
    }
    
    // Determine HTTP status code
    // 200 if everything is healthy, 503 if unhealthy
    const isHealthy = dbConnected && tablesReady;
    const statusCode = isHealthy ? 200 : 503;
    
    res.status(statusCode).json({
      db_connected: dbConnected,
      tables_ready: tablesReady,
      status: isHealthy ? 'healthy' : 'unhealthy',
    });
    
  } catch (error) {
    // Unexpected error in health check itself
    logger.error('Health check error', error);
    res.status(503).json({
      db_connected: false,
      tables_ready: false,
      status: 'error',
      error: 'Health check failed',
    });
  }
});

module.exports = router;
