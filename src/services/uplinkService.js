const db = require('../db/connection');
const { calculateRfScore } = require('../utils/rfScore');
const logger = require('../utils/logger');

/**
 * Process an uplink event from ChirpStack
 * Extracts raw data and stores it in the database
 * 
 * @param {Object} payload - ChirpStack uplink payload
 */
async function processUplink(payload) {
  // Extract device EUI
  const devEui = payload.deviceInfo?.devEui;
  
  // Extract rxInfo array (contains gateway information)
  const rxInfo = payload.rxInfo || [];
  
  if (!devEui) {
    logger.warn('Invalid uplink payload: missing devEui');
    return;
  }
  
  if (!rxInfo || rxInfo.length === 0) {
    logger.warn('Invalid uplink payload: missing rxInfo', { devEui });
    return;
  }
  
  logger.debug('Processing uplink', { devEui, rxInfoCount: rxInfo.length });
  
  // Process each rxInfo item (multiple gateways can receive the same uplink)
  for (const rxItem of rxInfo) {
    // Extract required fields
    const gatewayId = rxItem?.gatewayId;
    const rssi = rxItem?.rssi;
    const snr = rxItem?.snr;
    const time = rxItem?.time || new Date().toISOString();
    
    // Skip if required fields are missing
    if (!gatewayId || rssi === undefined || snr === undefined) {
      logger.warn('Skipping invalid rxInfo', { gatewayId, rssi, snr, devEui });
      continue;
    }
    
    logger.debug('Processing rxInfo', { gatewayId, rssi, snr, timestamp: time, devEui });
    
    // Calculate rf_score (simple calculation, not business logic)
    const rfScore = calculateRfScore(snr, rssi);
    
    // Use timestamp from rxInfo or current time
    const timestamp = time || new Date().toISOString();
    
    // Store raw data in database (transaction ensures data integrity)
    await storeUplink(devEui, gatewayId, timestamp, rssi, snr, rfScore);
  }
}

/**
 * Store uplink in database using transaction
 * Inserts raw data without business logic validation
 * Relies on database triggers to update last_seen fields
 * 
 * @param {string} devEui - Device EUI
 * @param {string} gatewayId - Gateway ID
 * @param {string} timestamp - Uplink timestamp (ISO string)
 * @param {number} rssi - RSSI value
 * @param {number} snr - SNR value
 * @param {number} rfScore - Computed RF score
 */
async function storeUplink(devEui, gatewayId, timestamp, rssi, snr, rfScore) {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Upsert gateway: insert if not exists, do nothing on conflict
    // Triggers will update last_seen automatically when uplink is inserted
    await client.query(`
      INSERT INTO gateways (gateway_id, first_seen)
      VALUES ($1, CURRENT_TIMESTAMP)
      ON CONFLICT (gateway_id) DO NOTHING
    `, [gatewayId]);
    
    // Upsert device: insert if not exists, do nothing on conflict
    // Triggers will update last_seen automatically when uplink is inserted
    await client.query(`
      INSERT INTO devices (dev_eui, first_seen)
      VALUES ($1, CURRENT_TIMESTAMP)
      ON CONFLICT (dev_eui) DO NOTHING
    `, [devEui]);
    
    // Insert uplink
    // Triggers will automatically update gateways.last_seen and devices.last_seen
    // is_best defaults to FALSE per schema
    await client.query(`
      INSERT INTO uplinks (dev_eui, gateway_id, timestamp, rssi, snr, rf_score, is_best)
      VALUES ($1, $2, $3, $4, $5, $6, FALSE)
    `, [devEui, gatewayId, timestamp, rssi, snr, rfScore]);
    
    await client.query('COMMIT');
    logger.debug('Uplink stored successfully', { devEui, gatewayId, timestamp });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error storing uplink', {
      devEui,
      gatewayId,
      error: error.message,
      code: error.code,
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get the most recent uplink across all gateways
 * @returns {Promise<Object|null>} Last uplink or null
 */
async function getLastUplink() {
  try {
    const result = await db.query(`
      SELECT 
        u.timestamp,
        u.dev_eui,
        u.gateway_id,
        u.rssi,
        u.snr,
        u.rf_score
      FROM uplinks u
      ORDER BY u.timestamp DESC
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error fetching last uplink:', error);
    throw error;
  }
}

module.exports = {
  processUplink,
  getLastUplink,
};
