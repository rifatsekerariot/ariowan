const db = require('../db/connection');
const logger = require('../utils/logger');

/**
 * Ensure device_locations table exists
 * Creates table if it doesn't exist (idempotent)
 */
async function ensureDeviceLocationsTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS device_locations (
        id BIGSERIAL PRIMARY KEY,
        dev_eui VARCHAR(255) NOT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        altitude DECIMAL(8, 2),
        timestamp TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dev_eui) REFERENCES devices(dev_eui) ON DELETE CASCADE
      )
    `);
    
    // Create index for efficient queries
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_device_locations_dev_eui_timestamp 
      ON device_locations(dev_eui, timestamp DESC)
    `);
    
    // Create index for spatial queries (coverage/heatmap analytics)
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_device_locations_timestamp 
      ON device_locations(timestamp DESC)
    `);
    
    // Create index for linking with uplinks (by device and timestamp proximity)
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_device_locations_dev_eui_created 
      ON device_locations(dev_eui, created_at DESC)
    `);
  } catch (error) {
    logger.error('Error ensuring device_locations table exists', {
      error: error.message,
      code: error.code,
    });
    throw error;
  }
}

/**
 * Process a location event from ChirpStack
 * Tracks device location for coverage and heatmap analytics
 * 
 * Extracts:
 * - dev_eui from deviceInfo.devEui
 * - latitude from payload.location.latitude
 * - longitude from payload.location.longitude
 * - altitude from payload.location.altitude (optional)
 * - timestamp from payload.time or current time
 * 
 * Links location with device for future RF data correlation
 * 
 * @param {Object} payload - ChirpStack location event payload
 */
async function processLocation(payload) {
  if (!payload || typeof payload !== 'object') {
    logger.warn('Invalid location payload: not an object');
    return;
  }
  
  // Extract device EUI from deviceInfo.devEui
  const devEui = payload.deviceInfo?.devEui;
  
  if (!devEui || typeof devEui !== 'string') {
    logger.warn('Invalid location payload: missing or invalid devEui', {
      hasDeviceInfo: !!payload.deviceInfo,
      devEui: payload.deviceInfo?.devEui,
    });
    return;
  }
  
  // Extract location data
  const location = payload.location;
  
  if (!location || typeof location !== 'object') {
    logger.warn('Invalid location payload: missing location object', { devEui });
    return;
  }
  
  // Extract latitude (required)
  const latitude = location.latitude;
  if (latitude === null || latitude === undefined || typeof latitude !== 'number') {
    logger.warn('Invalid location payload: missing or invalid latitude', { devEui });
    return;
  }
  
  // Validate latitude range (-90 to 90)
  if (latitude < -90 || latitude > 90) {
    logger.warn('Invalid location payload: latitude out of range', { 
      devEui, 
      latitude,
    });
    return;
  }
  
  // Extract longitude (required)
  const longitude = location.longitude;
  if (longitude === null || longitude === undefined || typeof longitude !== 'number') {
    logger.warn('Invalid location payload: missing or invalid longitude', { devEui });
    return;
  }
  
  // Validate longitude range (-180 to 180)
  if (longitude < -180 || longitude > 180) {
    logger.warn('Invalid location payload: longitude out of range', { 
      devEui, 
      longitude,
    });
    return;
  }
  
  // Extract altitude (optional)
  let altitude = location.altitude !== undefined && location.altitude !== null 
    ? location.altitude 
    : null;
  
  // Validate altitude if provided (reasonable range: -500 to 9000 meters)
  if (altitude !== null && (typeof altitude !== 'number' || altitude < -500 || altitude > 9000)) {
    logger.warn('Invalid location payload: altitude out of range, ignoring', { 
      devEui, 
      altitude,
    });
    // Set to null instead of failing
    altitude = null;
  }
  
  // Extract timestamp: use payload.time if available, otherwise current time
  let timestamp;
  if (payload.time) {
    if (typeof payload.time === 'string') {
      const parsed = new Date(payload.time);
      if (isNaN(parsed.getTime())) {
        logger.warn('Invalid timestamp in location payload, using current time', {
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
  
  logger.debug('Processing location event', {
    devEui,
    latitude,
    longitude,
    altitude,
    timestamp,
  });
  
  // Ensure table exists (idempotent)
  await ensureDeviceLocationsTable();
  
  // Store location event
  await storeLocation(devEui, latitude, longitude, altitude, timestamp);
}

/**
 * Store location event and update device last_seen
 * Stores timestamped location for coverage and heatmap analytics
 * Location can be linked to latest uplink RF data via dev_eui and timestamp proximity
 * 
 * @param {string} devEui - Device EUI
 * @param {number} latitude - Latitude (-90 to 90)
 * @param {number} longitude - Longitude (-180 to 180)
 * @param {number|null} altitude - Altitude in meters (optional)
 * @param {string} timestamp - Location timestamp (ISO string)
 */
async function storeLocation(devEui, latitude, longitude, altitude, timestamp) {
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
    
    // Insert location event
    // Location is linked to device via dev_eui
    // Can be correlated with uplinks via timestamp proximity queries
    await client.query(`
      INSERT INTO device_locations (dev_eui, latitude, longitude, altitude, timestamp)
      VALUES ($1, $2, $3, $4, $5)
    `, [devEui, latitude, longitude, altitude, timestamp]);
    
    await client.query('COMMIT');
    logger.debug('Location event stored successfully', { 
      devEui, 
      latitude,
      longitude,
      altitude,
      timestamp,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error storing location event', {
      devEui,
      latitude,
      longitude,
      error: error.message,
      code: error.code,
    });
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  processLocation,
};
