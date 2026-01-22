const db = require('../db/connection');
const { calculateRfScore } = require('../utils/rfScore');
const logger = require('../utils/logger');

/**
 * Process an uplink event from ChirpStack
 * Extracts raw data and stores it safely in the database
 * 
 * Extracts:
 * - gateway_id from rxInfo[].gatewayId
 * - dev_eui from deviceInfo.devEui
 * - rssi from rxInfo[].rssi
 * - snr from rxInfo[].snr
 * - timestamp from rxInfo[].time or current time
 * 
 * @param {Object} payload - ChirpStack uplink payload
 */
async function processUplink(payload) {
  if (!payload || typeof payload !== 'object') {
    logger.warn('Invalid uplink payload: not an object');
    return;
  }
  
  // Extract device EUI from deviceInfo.devEui
  const devEui = payload.deviceInfo?.devEui;
  
  if (!devEui || typeof devEui !== 'string') {
    logger.warn('Invalid uplink payload: missing or invalid devEui', {
      hasDeviceInfo: !!payload.deviceInfo,
      devEui: payload.deviceInfo?.devEui,
    });
    return;
  }
  
  // Extract rxInfo array (contains gateway information)
  const rxInfo = payload.rxInfo;
  
  if (!Array.isArray(rxInfo) || rxInfo.length === 0) {
    logger.warn('Invalid uplink payload: missing or empty rxInfo', { 
      devEui,
      hasRxInfo: !!rxInfo,
      rxInfoType: Array.isArray(rxInfo) ? 'array' : typeof rxInfo,
    });
    return;
  }
  
  logger.debug('Processing uplink', { 
    devEui, 
    rxInfoCount: rxInfo.length,
  });
  
  // Extract and validate all rxInfo entries first
  const validRxInfo = [];
  for (let i = 0; i < rxInfo.length; i++) {
    const rxItem = rxInfo[i];
    
    if (!rxItem || typeof rxItem !== 'object') {
      logger.warn('Invalid rxInfo item: not an object', { 
        devEui, 
        index: i,
      });
      continue;
    }
    
    const gatewayId = rxItem.gatewayId;
    const rssi = rxItem.rssi;
    const snr = rxItem.snr;
    
    // Validate required fields
    if (!gatewayId || typeof gatewayId !== 'string') {
      logger.warn('Skipping invalid rxInfo: missing or invalid gatewayId', { 
        devEui, 
        index: i,
        gatewayId,
      });
      continue;
    }
    
    if (typeof rssi !== 'number' || isNaN(rssi)) {
      logger.warn('Skipping invalid rxInfo: missing or invalid rssi', { 
        devEui, 
        gatewayId,
        index: i,
        rssi,
      });
      continue;
    }
    
    if (typeof snr !== 'number' || isNaN(snr)) {
      logger.warn('Skipping invalid rxInfo: missing or invalid snr', { 
        devEui, 
        gatewayId,
        index: i,
        snr,
      });
      continue;
    }
    
    validRxInfo.push({ gatewayId, rssi, snr, time: rxItem.time, index: i });
  }
  
  if (validRxInfo.length === 0) {
    logger.warn('No valid rxInfo entries found', { devEui });
    return;
  }
  
  // Compute multi-gateway RF quality metrics
  // Best is defined as highest SNR
  const gatewayCount = validRxInfo.length;
  const bestEntry = validRxInfo.reduce((best, current) => {
    return current.snr > best.snr ? current : best;
  });
  const bestRssi = bestEntry.rssi;
  const bestSnr = bestEntry.snr;
  
  logger.debug('Computed multi-gateway metrics', {
    devEui,
    gatewayCount,
    bestRssi,
    bestSnr,
    bestGatewayId: bestEntry.gatewayId,
  });
  
  // Process each valid rxInfo item (multiple gateways can receive the same uplink)
  for (let i = 0; i < validRxInfo.length; i++) {
    const rxItem = validRxInfo[i];
    
    if (!rxItem || typeof rxItem !== 'object') {
      logger.warn('Invalid rxInfo item: not an object', { 
        devEui, 
        index: i,
      });
      continue;
    }
    
    // Extract fields (already validated)
    const gatewayId = rxItem.gatewayId;
    const rssi = rxItem.rssi;
    const snr = rxItem.snr;
    const time = rxItem.time;
    
    // Determine if this is the best gateway (highest SNR)
    const isBest = (snr === bestSnr && gatewayId === bestEntry.gatewayId);
    
    // Extract timestamp: use rxInfo[].time if available, otherwise current time
    let timestamp;
    if (time) {
      // Try to parse if it's a string, otherwise use as-is
      if (typeof time === 'string') {
        const parsed = new Date(time);
        if (isNaN(parsed.getTime())) {
          logger.warn('Invalid timestamp in rxInfo, using current time', {
            devEui,
            gatewayId,
            time,
          });
          timestamp = new Date().toISOString();
        } else {
          timestamp = parsed.toISOString();
        }
      } else if (time instanceof Date) {
        timestamp = time.toISOString();
      } else {
        // Fallback to current time
        timestamp = new Date().toISOString();
      }
    } else {
      // No timestamp provided, use current time
      timestamp = new Date().toISOString();
    }
    
    logger.debug('Processing rxInfo item', { 
      devEui,
      gatewayId, 
      rssi, 
      snr, 
      timestamp,
      index: i,
    });
    
    // Calculate rf_score (simple calculation, not business logic)
    const rfScore = calculateRfScore(snr, rssi);
    
    // Store raw data in database (transaction ensures data integrity)
    // Include multi-gateway metrics: best_rssi, best_snr, gateway_count
    await storeUplink(
      devEui, 
      gatewayId, 
      timestamp, 
      rssi, 
      snr, 
      rfScore, 
      isBest,
      bestRssi,
      bestSnr,
      gatewayCount
    );
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
 * @param {boolean} isBest - Whether this gateway has the best SNR
 * @param {number} bestRssi - Best RSSI across all gateways
 * @param {number} bestSnr - Best SNR across all gateways
 * @param {number} gatewayCount - Number of gateways that received this uplink
 */
async function storeUplink(devEui, gatewayId, timestamp, rssi, snr, rfScore, isBest, bestRssi, bestSnr, gatewayCount) {
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
    // is_best marks the gateway with highest SNR
    await client.query(`
      INSERT INTO uplinks (dev_eui, gateway_id, timestamp, rssi, snr, rf_score, is_best)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [devEui, gatewayId, timestamp, rssi, snr, rfScore, isBest]);
    
    // Log multi-gateway metrics for debugging
    logger.debug('Uplink stored with multi-gateway metrics', {
      devEui,
      gatewayId,
      isBest,
      bestRssi,
      bestSnr,
      gatewayCount,
    });
    
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
 * Uses PostgreSQL query with index on timestamp
 * @returns {Promise<Object|null>} Last uplink or null if no data
 */
async function getLastUplink() {
  try {
    const result = await db.query(`
      SELECT 
        u.timestamp,
        u.dev_eui as "dev_eui",
        u.gateway_id as "gateway_id",
        u.rssi,
        u.snr,
        u.rf_score as "rf_score"
      FROM uplinks u
      ORDER BY u.timestamp DESC
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    // Format response with camelCase field names
    const row = result.rows[0];
    return {
      timestamp: row.timestamp,
      devEui: row.dev_eui,
      gatewayId: row.gateway_id,
      rssi: parseFloat(row.rssi),
      snr: parseFloat(row.snr),
      rfScore: row.rf_score,
    };
  } catch (error) {
    logger.error('Error fetching last uplink', error);
    throw error;
  }
}

module.exports = {
  processUplink,
  getLastUplink,
};
