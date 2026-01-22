const db = require('../db/connection');
const logger = require('../utils/logger');

/**
 * Ensure device_logs table exists
 * Creates table if it doesn't exist (idempotent)
 */
async function ensureDeviceLogsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS device_logs (
        id BIGSERIAL PRIMARY KEY,
        dev_eui VARCHAR(255) NOT NULL,
        level VARCHAR(10) NOT NULL,
        code VARCHAR(50),
        description TEXT,
        timestamp TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dev_eui) REFERENCES devices(dev_eui) ON DELETE CASCADE
      )
    `);
    
    // Create index for efficient queries
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_device_logs_dev_eui_timestamp 
      ON device_logs(dev_eui, timestamp DESC)
    `);
    
    // Create index for level-based queries
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_device_logs_dev_eui_level 
      ON device_logs(dev_eui, level)
    `);
    
    // Create index for code-based pattern analysis
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_device_logs_code 
      ON device_logs(code)
    `);
  } catch (error) {
    logger.error('Error ensuring device_logs table exists', {
      error: error.message,
      code: error.code,
    });
    throw error;
  }
}

/**
 * Process a log event from ChirpStack
 * Tracks ERROR and WARN level logs for error pattern analytics
 * 
 * Extracts:
 * - dev_eui from deviceInfo.devEui (or gatewayId if device-level log)
 * - level from payload.level
 * - code from payload.code
 * - description from payload.description
 * - timestamp from payload.time or current time
 * 
 * Stores only ERROR and WARN levels
 * 
 * @param {Object} payload - ChirpStack log event payload
 */
async function processLog(payload) {
  if (!payload || typeof payload !== 'object') {
    logger.warn('Invalid log payload: not an object');
    return;
  }
  
  // Extract device EUI from deviceInfo.devEui (preferred)
  // If not available, try to extract from gatewayId (for gateway-level logs)
  let devEui = payload.deviceInfo?.devEui;
  
  // If no deviceInfo.devEui, check if this is a device-related log
  // Some log events might not have deviceInfo, skip those
  if (!devEui || typeof devEui !== 'string') {
    logger.debug('Log event without device EUI, skipping', {
      hasDeviceInfo: !!payload.deviceInfo,
      hasGatewayId: !!payload.gatewayId,
    });
    return;
  }
  
  // Extract level (ERROR, WARN, INFO, DEBUG, etc.)
  const level = payload.level;
  
  // Only process ERROR and WARN levels
  if (!level || typeof level !== 'string') {
    logger.debug('Log event without level, skipping', { devEui });
    return;
  }
  
  const normalizedLevel = level.toUpperCase();
  if (normalizedLevel !== 'ERROR' && normalizedLevel !== 'WARN') {
    logger.debug('Log event level not ERROR or WARN, skipping', { 
      devEui, 
      level: normalizedLevel,
    });
    return;
  }
  
  // Extract code (optional)
  const code = payload.code || null;
  
  // Extract description (optional)
  const description = payload.description || payload.message || null;
  
  // Extract timestamp: use payload.time if available, otherwise current time
  let timestamp;
  if (payload.time) {
    if (typeof payload.time === 'string') {
      const parsed = new Date(payload.time);
      if (isNaN(parsed.getTime())) {
        logger.warn('Invalid timestamp in log payload, using current time', {
          devEui,
          time: payload.time,
        });
        timestamp = new Date().toISOString();
      } else {
        timestamp = parsed.toISOString();
      }
    } else if (payload.time instanceof Date) {
      timestamp = payload.time.toISOString();
    } else {
      timestamp = new Date().toISOString();
    }
  } else {
    timestamp = new Date().toISOString();
  }
  
  logger.debug('Processing log event', {
    devEui,
    level: normalizedLevel,
    code,
    hasDescription: !!description,
    timestamp,
  });
  
  // Ensure table exists (idempotent)
  await ensureDeviceLogsTable();
  
  // Store log event (only ERROR and WARN)
  await storeLog(devEui, normalizedLevel, code, description, timestamp);
}

/**
 * Store log event and update device last_seen
 * Stores ERROR and WARN level logs for error pattern analytics
 * 
 * @param {string} devEui - Device EUI
 * @param {string} level - Log level ('ERROR' or 'WARN')
 * @param {string|null} code - Error code (optional)
 * @param {string|null} description - Error description (optional)
 * @param {string} timestamp - Log timestamp (ISO string)
 */
async function storeLog(devEui, level, code, description, timestamp) {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Upsert device: insert if not exists, update last_seen on conflict
    await client.query(`
      INSERT INTO devices (dev_eui, first_seen, last_seen)
      VALUES ($1, CURRENT_TIMESTAMP, $2)
      ON CONFLICT (dev_eui) DO UPDATE
      SET last_seen = $2,
          updated_at = CURRENT_TIMESTAMP
    `, [devEui, timestamp]);
    
    // Insert log event (only ERROR and WARN levels)
    await client.query(`
      INSERT INTO device_logs (dev_eui, level, code, description, timestamp)
      VALUES ($1, $2, $3, $4, $5)
    `, [devEui, level, code, description, timestamp]);
    
    await client.query('COMMIT');
    logger.debug('Log event stored successfully', { 
      devEui, 
      level,
      code,
      timestamp,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error storing log event', {
      devEui,
      level,
      error: error.message,
      code: error.code,
    });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  processLog,
};
