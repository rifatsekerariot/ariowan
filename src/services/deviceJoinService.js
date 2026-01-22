const db = require('../db/connection');
const logger = require('../utils/logger');

/**
 * Ensure join_events table exists
 * Creates table if it doesn't exist (idempotent)
 */
async function ensureJoinEventsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS join_events (
        id BIGSERIAL PRIMARY KEY,
        dev_eui VARCHAR(255) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dev_eui) REFERENCES devices(dev_eui) ON DELETE CASCADE
      )
    `);
    
    // Create index for efficient queries
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_join_events_dev_eui_timestamp 
      ON join_events(dev_eui, timestamp DESC)
    `);
    
    // Create index for daily frequency queries
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_join_events_timestamp 
      ON join_events(timestamp DESC)
    `);
  } catch (error) {
    logger.error('Error ensuring join_events table exists', {
      error: error.message,
      code: error.code,
    });
    throw error;
  }
}

/**
 * Process a device join event from ChirpStack
 * Tracks join events for device stability and roaming analysis
 * 
 * Extracts:
 * - dev_eui from deviceInfo.devEui
 * - timestamp from payload.time or current time
 * 
 * Stores:
 * - Join event with timestamp only
 * - Updates device last_seen
 * 
 * @param {Object} payload - ChirpStack join event payload
 */
async function processJoin(payload) {
  if (!payload || typeof payload !== 'object') {
    logger.warn('Invalid join payload: not an object');
    return;
  }
  
  // Extract device EUI from deviceInfo.devEui
  const devEui = payload.deviceInfo?.devEui;
  
  if (!devEui || typeof devEui !== 'string') {
    logger.warn('Invalid join payload: missing or invalid devEui', {
      hasDeviceInfo: !!payload.deviceInfo,
      devEui: payload.deviceInfo?.devEui,
    });
    return;
  }
  
  // Extract timestamp: use payload.time if available, otherwise current time
  let timestamp;
  if (payload.time) {
    if (typeof payload.time === 'string') {
      const parsed = new Date(payload.time);
      if (isNaN(parsed.getTime())) {
        logger.warn('Invalid timestamp in join payload, using current time', {
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
  
  logger.debug('Processing join event', {
    devEui,
    timestamp,
  });
  
  // Ensure table exists (idempotent)
  await ensureJoinEventsTable();
  
  // Store join event and update device last_seen
  await storeJoin(devEui, timestamp);
}

/**
 * Store join event and update device last_seen
 * Stores minimal data (dev_eui, timestamp) for frequency analysis
 * 
 * @param {string} devEui - Device EUI
 * @param {string} timestamp - Join timestamp (ISO string)
 */
async function storeJoin(devEui, timestamp) {
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
    
    // Insert join event (timestamp only)
    await client.query(`
      INSERT INTO join_events (dev_eui, timestamp)
      VALUES ($1, $2)
    `, [devEui, timestamp]);
    
    await client.query('COMMIT');
    logger.debug('Join event stored successfully', { 
      devEui, 
      timestamp,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error storing join event', {
      devEui,
      error: error.message,
      code: error.code,
    });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  processJoin,
};
