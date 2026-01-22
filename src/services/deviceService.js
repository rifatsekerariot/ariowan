const db = require('../db/connection');
const { calculateUplinkContinuity } = require('../utils/connectivity');
const logger = require('../utils/logger');

const EXPECTED_UPLINK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const OFFLINE_THRESHOLD_MS = 5 * EXPECTED_UPLINK_INTERVAL_MS; // 75 minutes

/**
 * Determine device status based on last_seen timestamp
 * - last_seen < 10 min => ONLINE
 * - last_seen 10–60 min => WARNING
 * - else => OFFLINE
 * 
 * @param {Date|string} lastSeen - Last seen timestamp
 * @returns {string} Status (ONLINE, WARNING, or OFFLINE)
 */
function determineDeviceStatus(lastSeen) {
  if (!lastSeen) {
    return 'OFFLINE';
  }
  
  const now = new Date();
  const lastSeenDate = new Date(lastSeen);
  const diffMs = now - lastSeenDate;
  const diffMins = diffMs / (1000 * 60);
  
  if (diffMins < 10) {
    return 'ONLINE';
  } else if (diffMins >= 10 && diffMins < 60) {
    return 'WARNING';
  } else {
    return 'OFFLINE';
  }
}

/**
 * Get health metrics for all devices
 * Uses PostgreSQL query with optimized indexes
 * Returns empty array if no data exists
 * 
 * Returns:
 * - dev_eui
 * - last_seen
 * - uplink_count_last_24h
 * - status (ONLINE, WARNING, or OFFLINE)
 * 
 * @returns {Promise<Array>} Array of device health objects (empty array if no data)
 */
async function getDeviceHealth() {
  try {
    // Query uses idx_uplinks_dev_eui_timestamp index
    // Get dev_eui, last_seen, and uplink count for last 24 hours
    const result = await db.query(`
      SELECT 
        d.dev_eui,
        MAX(u.timestamp) as last_seen,
        COUNT(CASE WHEN u.timestamp >= NOW() - INTERVAL '24 hours' THEN 1 END) as uplink_count_last_24h
      FROM devices d
      LEFT JOIN uplinks u ON d.dev_eui = u.dev_eui
      GROUP BY d.dev_eui
      ORDER BY d.dev_eui
    `);
    
    // Return empty array if no results
    if (result.rows.length === 0) {
      logger.debug('No device health data found');
      return [];
    }
    
    // Calculate status for each device
    const deviceHealth = [];
    for (const row of result.rows) {
      const status = determineDeviceStatus(row.last_seen);
      const uplinkCount = parseInt(row.uplink_count_last_24h || 0, 10);
      
      deviceHealth.push({
        dev_eui: row.dev_eui,
        last_seen: row.last_seen,
        uplink_count_last_24h: uplinkCount,
        status: status,
      });
    }
    
    logger.debug('Device health data retrieved', { count: deviceHealth.length });
    return deviceHealth;
  } catch (error) {
    logger.error('Error fetching device health', error);
    throw error;
  }
}

/**
 * Get detailed information for a specific device
 * @param {string} devEui - Device EUI
 * @returns {Promise<Object|null>} Device details or null if not found
 */
async function getDeviceDetails(devEui) {
  try {
    // Get device metadata
    const deviceResult = await db.query(`
      SELECT * FROM devices WHERE dev_eui = $1
    `, [devEui]);
    
    if (deviceResult.rows.length === 0) {
      return null;
    }
    
    // Get last 20 uplinks
    const uplinksResult = await db.query(`
      SELECT 
        timestamp,
        gateway_id,
        rssi,
        snr,
        rf_score
      FROM uplinks
      WHERE dev_eui = $1
      ORDER BY timestamp DESC
      LIMIT 20
    `, [devEui]);
    
    if (uplinksResult.rows.length === 0) {
      return null;
    }
    
    // Calculate avgScore (average rfScore of last 20 uplinks)
    const avgScore = uplinksResult.rows.reduce((sum, u) => sum + u.rf_score, 0) / uplinksResult.rows.length;
    const roundedAvgScore = Math.round(avgScore * 100) / 100;
    
    // Determine rfStatus
    let rfStatus;
    if (roundedAvgScore >= 80) {
      rfStatus = 'HEALTHY';
    } else if (roundedAvgScore >= 50) {
      rfStatus = 'DEGRADED';
    } else {
      rfStatus = 'CRITICAL';
    }
    
    // Get lastSeen from most recent uplink
    const lastSeen = uplinksResult.rows[0].timestamp;
    
    // Calculate connectivity status
    const connectivityStatus = calculateUplinkContinuity(lastSeen);
    
    // Format uplinks
    const uplinks = uplinksResult.rows.map(u => ({
      timestamp: u.timestamp,
      gatewayId: u.gateway_id,
      rssi: parseFloat(u.rssi),
      snr: parseFloat(u.snr),
      rfScore: u.rf_score,
    }));
    
    return {
      devEui: devEui,
      avgScore: roundedAvgScore,
      rfStatus: rfStatus,
      connectivityStatus: connectivityStatus,
      lastSeen: lastSeen,
      uplinks: uplinks,
    };
  } catch (error) {
    console.error('Error fetching device details:', error);
    throw error;
  }
}

/**
 * Get list of all devices
 * @returns {Promise<Array>} Array of device objects
 */
async function getAllDevices() {
  try {
    const result = await db.query(`
      SELECT 
        dev_eui,
        first_seen,
        last_seen,
        created_at,
        updated_at
      FROM devices
      ORDER BY dev_eui
    `);
    
    return result.rows.map(row => ({
      devEui: row.dev_eui,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    console.error('Error fetching all devices:', error);
    throw error;
  }
}

/**
 * Get metrics for a specific device with optional time-range filtering
 * Uses optimized query with idx_uplinks_dev_eui_timestamp index
 * 
 * @param {string} devEui - Device EUI
 * @param {string} from - Optional ISO timestamp for start of range
 * @param {string} to - Optional ISO timestamp for end of range
 * @returns {Promise<Object|null>} Device metrics or null if not found
 */
async function getDeviceMetrics(devEui, from, to) {
  try {
    // Check if device exists
    const deviceCheck = await db.query(`
      SELECT dev_eui FROM devices WHERE dev_eui = $1
    `, [devEui]);
    
    if (deviceCheck.rows.length === 0) {
      return null;
    }
    
    // Build time-range WHERE clause
    let timeRangeClause = '';
    const queryParams = [devEui];
    let paramIndex = 2;
    
    if (from) {
      timeRangeClause += ` AND u.timestamp >= $${paramIndex}`;
      queryParams.push(from);
      paramIndex++;
    }
    
    if (to) {
      timeRangeClause += ` AND u.timestamp <= $${paramIndex}`;
      queryParams.push(to);
      paramIndex++;
    }
    
    // Optimized query using idx_uplinks_dev_eui_timestamp index
    const result = await db.query(`
      SELECT 
        COUNT(u.id) as total_uplinks,
        COUNT(DISTINCT u.gateway_id) as gateway_count,
        ROUND(AVG(u.rf_score)::numeric, 2) as avg_rf_score,
        MIN(u.rf_score) as min_rf_score,
        MAX(u.rf_score) as max_rf_score,
        ROUND(AVG(u.rssi)::numeric, 2) as avg_rssi,
        ROUND(AVG(u.snr)::numeric, 2) as avg_snr,
        MIN(u.timestamp) as first_seen,
        MAX(u.timestamp) as last_seen
      FROM uplinks u
      WHERE u.dev_eui = $1
        ${timeRangeClause}
    `, queryParams);
    
    if (result.rows.length === 0 || result.rows[0].total_uplinks === '0') {
      return {
        devEui: devEui,
        totalUplinks: 0,
        gatewayCount: 0,
        avgRfScore: null,
        minRfScore: null,
        maxRfScore: null,
        avgRssi: null,
        avgSnr: null,
        firstSeen: null,
        lastSeen: null,
      };
    }
    
    const row = result.rows[0];
    
    // Calculate connectivity status based on last_seen
    const connectivityStatus = calculateUplinkContinuity(row.last_seen);
    
    // Determine RF status based on avg_rf_score
    let rfStatus = 'UNKNOWN';
    if (row.avg_rf_score) {
      const avgScore = parseFloat(row.avg_rf_score);
      if (avgScore >= 80) {
        rfStatus = 'HEALTHY';
      } else if (avgScore >= 50) {
        rfStatus = 'DEGRADED';
      } else {
        rfStatus = 'CRITICAL';
      }
    }
    
    return {
      devEui: devEui,
      totalUplinks: parseInt(row.total_uplinks, 10),
      gatewayCount: parseInt(row.gateway_count, 10),
      avgRfScore: row.avg_rf_score ? parseFloat(row.avg_rf_score) : null,
      minRfScore: row.min_rf_score ? parseInt(row.min_rf_score, 10) : null,
      maxRfScore: row.max_rf_score ? parseInt(row.max_rf_score, 10) : null,
      avgRssi: row.avg_rssi ? parseFloat(row.avg_rssi) : null,
      avgSnr: row.avg_snr ? parseFloat(row.avg_snr) : null,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      rfStatus: rfStatus,
      connectivityStatus: connectivityStatus,
    };
  } catch (error) {
    console.error('Error fetching device metrics:', error);
    throw error;
  }
}

/**
 * Get silent devices (devices with last_seen > 2x expected uplink interval)
 * Expected interval is 15 minutes, so threshold is 30 minutes
 * 
 * Returns:
 * - dev_eui
 * - last_seen
 * - silence_duration_minutes
 * 
 * @returns {Promise<Array>} Array of silent device objects (empty array if none)
 */
async function getSilentDevices() {
  try {
    // Expected uplink interval: 15 minutes
    // Silent threshold: 2x = 30 minutes
    // Query devices where last_seen is older than 30 minutes
    const result = await db.query(`
      SELECT 
        d.dev_eui,
        d.last_seen,
        EXTRACT(EPOCH FROM (NOW() - d.last_seen)) / 60 as silence_duration_minutes
      FROM devices d
      WHERE d.last_seen IS NOT NULL
        AND d.last_seen < NOW() - INTERVAL '30 minutes'
      ORDER BY d.last_seen ASC
    `);
    
    // Return empty array if no results
    if (result.rows.length === 0) {
      logger.debug('No silent devices found');
      return [];
    }
    
    // Format response
    const silentDevices = result.rows.map(row => ({
      dev_eui: row.dev_eui,
      last_seen: row.last_seen,
      silence_duration_minutes: Math.round(parseFloat(row.silence_duration_minutes)),
    }));
    
    logger.debug('Silent devices retrieved', { count: silentDevices.length });
    return silentDevices;
  } catch (error) {
    logger.error('Error fetching silent devices', error);
    throw error;
  }
}

module.exports = {
  getAllDevices,
  getDeviceHealth,
  getDeviceDetails,
  getDeviceMetrics,
  getSilentDevices,
};
