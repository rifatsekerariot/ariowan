const db = require('../db/connection');
const logger = require('../utils/logger');

/**
 * Process a device status event from ChirpStack
 * Extracts device health metrics and updates device information
 * 
 * Extracts:
 * - dev_eui from deviceInfo.devEui
 * - margin from payload.margin
 * - batteryLevel from payload.batteryLevel
 * - timestamp from payload.time or current time
 * 
 * Updates:
 * - device last_seen timestamp
 * - device margin and batteryLevel (if columns exist)
 * 
 * @param {Object} payload - ChirpStack status event payload
 */
async function processStatus(payload) {
  if (!payload || typeof payload !== 'object') {
    logger.warn('Invalid status payload: not an object');
    return;
  }
  
  // Extract device EUI from deviceInfo.devEui
  const devEui = payload.deviceInfo?.devEui;
  
  if (!devEui || typeof devEui !== 'string') {
    logger.warn('Invalid status payload: missing or invalid devEui', {
      hasDeviceInfo: !!payload.deviceInfo,
      devEui: payload.deviceInfo?.devEui,
    });
    return;
  }
  
  // Extract margin and batteryLevel (optional fields)
  const margin = payload.margin;
  const batteryLevel = payload.batteryLevel;
  
  // Extract timestamp: use payload.time if available, otherwise current time
  let timestamp;
  if (payload.time) {
    if (typeof payload.time === 'string') {
      const parsed = new Date(payload.time);
      if (isNaN(parsed.getTime())) {
        logger.warn('Invalid timestamp in status payload, using current time', {
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
  
  logger.debug('Processing status event', {
    devEui,
    margin,
    batteryLevel,
    timestamp,
  });
  
  // Store status and update device last_seen
  await storeStatus(devEui, timestamp, margin, batteryLevel);
}

/**
 * Store device status and update device last_seen
 * Updates device table with status information if columns exist
 * Always updates last_seen timestamp
 * 
 * @param {string} devEui - Device EUI
 * @param {string} timestamp - Status timestamp (ISO string)
 * @param {number|null} margin - Link margin value (optional)
 * @param {number|null} batteryLevel - Battery level value (optional)
 */
async function storeStatus(devEui, timestamp, margin, batteryLevel) {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Upsert device: insert if not exists, do nothing on conflict
    await client.query(`
      INSERT INTO devices (dev_eui, first_seen, last_seen)
      VALUES ($1, CURRENT_TIMESTAMP, $2)
      ON CONFLICT (dev_eui) DO UPDATE
      SET last_seen = $2,
          updated_at = CURRENT_TIMESTAMP
    `, [devEui, timestamp]);
    
    // Try to update margin and batteryLevel if columns exist
    // Use a query that won't fail if columns don't exist
    // We'll check column existence first
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'devices' 
      AND column_name IN ('margin', 'battery_level')
    `);
    
    const existingColumns = columnCheck.rows.map(row => row.column_name);
    const hasMargin = existingColumns.includes('margin');
    const hasBatteryLevel = existingColumns.includes('battery_level');
    
    if (hasMargin || hasBatteryLevel) {
      const updates = [];
      const values = [];
      let paramIndex = 1;
      
      if (hasMargin && margin !== null && margin !== undefined) {
        updates.push(`margin = $${paramIndex}`);
        values.push(margin);
        paramIndex++;
      }
      
      if (hasBatteryLevel && batteryLevel !== null && batteryLevel !== undefined) {
        updates.push(`battery_level = $${paramIndex}`);
        values.push(batteryLevel);
        paramIndex++;
      }
      
      if (updates.length > 0) {
        values.push(devEui);
        await client.query(`
          UPDATE devices 
          SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
          WHERE dev_eui = $${paramIndex}
        `, values);
      }
    } else {
      // Columns don't exist - just log for now
      logger.debug('Status columns not present in devices table', {
        devEui,
        margin,
        batteryLevel,
      });
    }
    
    await client.query('COMMIT');
    logger.debug('Status stored successfully', { 
      devEui, 
      timestamp,
      margin,
      batteryLevel,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error storing status', {
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
  processStatus,
};
