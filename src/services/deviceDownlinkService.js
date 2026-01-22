const db = require('../db/connection');
const logger = require('../utils/logger');

/**
 * Ensure downlink_events table exists
 * Creates table if it doesn't exist (idempotent)
 */
async function ensureDownlinkEventsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS downlink_events (
        id BIGSERIAL PRIMARY KEY,
        dev_eui VARCHAR(255) NOT NULL,
        event_type VARCHAR(10) NOT NULL,
        acknowledged BOOLEAN,
        fcnt_down INTEGER,
        timestamp TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dev_eui) REFERENCES devices(dev_eui) ON DELETE CASCADE
      )
    `);
    
    // Create index for efficient queries
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_downlink_events_dev_eui_timestamp 
      ON downlink_events(dev_eui, timestamp DESC)
    `);
    
    // Create index for aggregation queries
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_downlink_events_dev_eui_type 
      ON downlink_events(dev_eui, event_type)
    `);
  } catch (error) {
    logger.error('Error ensuring downlink_events table exists', {
      error: error.message,
      code: error.code,
    });
    throw error;
  }
}

/**
 * Process an ack event from ChirpStack
 * Tracks application-level acknowledgments for downlink reliability
 * 
 * Extracts:
 * - dev_eui from deviceInfo.devEui
 * - acknowledged from payload.acknowledged
 * - timestamp from payload.time or current time
 * 
 * @param {Object} payload - ChirpStack ack event payload
 */
async function processAck(payload) {
  if (!payload || typeof payload !== 'object') {
    logger.warn('Invalid ack payload: not an object');
    return;
  }
  
  // Extract device EUI from deviceInfo.devEui
  const devEui = payload.deviceInfo?.devEui;
  
  if (!devEui || typeof devEui !== 'string') {
    logger.warn('Invalid ack payload: missing or invalid devEui', {
      hasDeviceInfo: !!payload.deviceInfo,
      devEui: payload.deviceInfo?.devEui,
    });
    return;
  }
  
  // Extract acknowledged (true/false)
  const acknowledged = payload.acknowledged;
  
  // Extract timestamp: use payload.time if available, otherwise current time
  let timestamp;
  if (payload.time) {
    if (typeof payload.time === 'string') {
      const parsed = new Date(payload.time);
      if (isNaN(parsed.getTime())) {
        logger.warn('Invalid timestamp in ack payload, using current time', {
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
  
  logger.debug('Processing ack event', {
    devEui,
    acknowledged,
    timestamp,
  });
  
  // Ensure table exists (idempotent)
  await ensureDownlinkEventsTable();
  
  // Store ack event
  await storeDownlinkEvent(devEui, 'ack', timestamp, acknowledged, null);
}

/**
 * Process a txack event from ChirpStack
 * Tracks transmission acknowledgments for downlink reliability
 * 
 * Extracts:
 * - dev_eui from deviceInfo.devEui
 * - fCntDown from payload.fCntDown
 * - timestamp from payload.time or current time
 * 
 * @param {Object} payload - ChirpStack txack event payload
 */
async function processTxAck(payload) {
  if (!payload || typeof payload !== 'object') {
    logger.warn('Invalid txack payload: not an object');
    return;
  }
  
  // Extract device EUI from deviceInfo.devEui
  const devEui = payload.deviceInfo?.devEui;
  
  if (!devEui || typeof devEui !== 'string') {
    logger.warn('Invalid txack payload: missing or invalid devEui', {
      hasDeviceInfo: !!payload.deviceInfo,
      devEui: payload.deviceInfo?.devEui,
    });
    return;
  }
  
  // Extract fCntDown
  const fCntDown = payload.fCntDown;
  
  // Extract timestamp: use payload.time if available, otherwise current time
  let timestamp;
  if (payload.time) {
    if (typeof payload.time === 'string') {
      const parsed = new Date(payload.time);
      if (isNaN(parsed.getTime())) {
        logger.warn('Invalid timestamp in txack payload, using current time', {
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
  
  logger.debug('Processing txack event', {
    devEui,
    fCntDown,
    timestamp,
  });
  
  // Ensure table exists (idempotent)
  await ensureDownlinkEventsTable();
  
  // Store txack event (txack events don't have acknowledged, but represent attempts)
  await storeDownlinkEvent(devEui, 'txack', timestamp, null, fCntDown);
}

/**
 * Store downlink event and update device last_seen
 * Stores event data for downlink reliability analysis
 * 
 * @param {string} devEui - Device EUI
 * @param {string} eventType - Event type ('ack' or 'txack')
 * @param {string} timestamp - Event timestamp (ISO string)
 * @param {boolean|null} acknowledged - Acknowledgment status (for ack events)
 * @param {number|null} fCntDown - Frame counter down (for txack events)
 */
async function storeDownlinkEvent(devEui, eventType, timestamp, acknowledged, fCntDown) {
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
    
    // Insert downlink event
    await client.query(`
      INSERT INTO downlink_events (dev_eui, event_type, acknowledged, fcnt_down, timestamp)
      VALUES ($1, $2, $3, $4, $5)
    `, [devEui, eventType, acknowledged, fCntDown, timestamp]);
    
    await client.query('COMMIT');
    logger.debug('Downlink event stored successfully', { 
      devEui, 
      eventType,
      timestamp,
      acknowledged,
      fCntDown,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error storing downlink event', {
      devEui,
      eventType,
      error: error.message,
      code: error.code,
    });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  processAck,
  processTxAck,
};
