const db = require('../db/connection');
const { calculateStabilityIndex, calculateStabilityIndexForGateway } = require('../utils/stability');
const logger = require('../utils/logger');

/**
 * Calculate health score based on SNR and RSSI thresholds
 * - SNR > 7 and RSSI > -90 => 100
 * - SNR 3–7 => 70
 * - Else => 40
 * 
 * @param {number} avgSnr - Average SNR
 * @param {number} avgRssi - Average RSSI
 * @returns {number} Health score (40, 70, or 100)
 */
function calculateHealthScore(avgSnr, avgRssi) {
  if (avgSnr > 7 && avgRssi > -90) {
    return 100;
  } else if (avgSnr >= 3 && avgSnr <= 7) {
    return 70;
  } else {
    return 40;
  }
}

/**
 * Get health metrics for all gateways
 * Uses PostgreSQL query with optimized indexes
 * Returns empty array if no data exists
 * 
 * Returns:
 * - gateway_id
 * - last_seen
 * - avg_snr (last 15 minutes)
 * - avg_rssi (last 15 minutes)
 * - health_score (calculated based on SNR and RSSI thresholds)
 * 
 * @returns {Promise<Array>} Array of gateway health objects (empty array if no data)
 */
async function getGatewayHealth() {
  try {
    // Query uses idx_uplinks_gateway_id_timestamp index
    // Get avg_snr and avg_rssi from last 15 minutes
    const result = await db.query(`
      SELECT 
        g.gateway_id,
        ROUND(AVG(u.snr)::numeric, 2) as avg_snr,
        ROUND(AVG(u.rssi)::numeric, 2) as avg_rssi,
        MAX(u.timestamp) as last_seen
      FROM gateways g
      INNER JOIN uplinks u ON g.gateway_id = u.gateway_id
      WHERE u.timestamp >= NOW() - INTERVAL '15 minutes'
      GROUP BY g.gateway_id
      HAVING COUNT(u.id) > 0
      ORDER BY g.gateway_id
    `);
    
    // Return empty array if no results
    if (result.rows.length === 0) {
      logger.debug('No gateway health data found');
      return [];
    }
    
    // Calculate health score for each gateway
    const gatewayHealth = [];
    for (const row of result.rows) {
      const avgSnr = row.avg_snr ? parseFloat(row.avg_snr) : null;
      const avgRssi = row.avg_rssi ? parseFloat(row.avg_rssi) : null;
      
      // Calculate health_score based on thresholds
      let healthScore = null;
      if (avgSnr !== null && avgRssi !== null) {
        healthScore = calculateHealthScore(avgSnr, avgRssi);
      }
      
      gatewayHealth.push({
        gateway_id: row.gateway_id,
        last_seen: row.last_seen,
        avg_snr: avgSnr,
        avg_rssi: avgRssi,
        health_score: healthScore,
      });
    }
    
    logger.debug(`Gateway health data retrieved`, { count: gatewayHealth.length });
    return gatewayHealth;
  } catch (error) {
    logger.error('Error fetching gateway health', error);
    throw error;
  }
}

/**
 * Get detailed information for a specific gateway
 * @param {string} gatewayId - Gateway ID
 * @returns {Promise<Object|null>} Gateway details or null if not found
 */
async function getGatewayDetails(gatewayId) {
  try {
    // Get gateway metadata
    const gatewayResult = await db.query(`
      SELECT * FROM gateways WHERE gateway_id = $1
    `, [gatewayId]);
    
    if (gatewayResult.rows.length === 0) {
      return null;
    }
    
    // Get last 20 uplinks
    const uplinksResult = await db.query(`
      SELECT 
        timestamp,
        dev_eui,
        rssi,
        snr,
        rf_score
      FROM uplinks
      WHERE gateway_id = $1
      ORDER BY timestamp DESC
      LIMIT 20
    `, [gatewayId]);
    
    if (uplinksResult.rows.length === 0) {
      return null;
    }
    
    // Calculate healthScore (average rfScore of last 20 uplinks)
    const avgScore = uplinksResult.rows.reduce((sum, u) => sum + u.rf_score, 0) / uplinksResult.rows.length;
    const healthScore = Math.round(avgScore * 100) / 100;
    
    // Determine status
    let status;
    if (healthScore >= 80) {
      status = 'HEALTHY';
    } else if (healthScore >= 50) {
      status = 'DEGRADED';
    } else {
      status = 'CRITICAL';
    }
    
    // Calculate stability index
    const snrValues = uplinksResult.rows.map(u => parseFloat(u.snr));
    const stabilityIndex = calculateStabilityIndex(snrValues);
    
    // Format uplinks
    const uplinks = uplinksResult.rows.map(u => ({
      timestamp: u.timestamp,
      devEui: u.dev_eui,
      rssi: parseFloat(u.rssi),
      snr: parseFloat(u.snr),
      rfScore: u.rf_score,
    }));
    
    return {
      gatewayId: gatewayId,
      healthScore: healthScore,
      status: status,
      stabilityIndex: stabilityIndex,
      uplinks: uplinks,
    };
  } catch (error) {
    console.error('Error fetching gateway details:', error);
    throw error;
  }
}

/**
 * Get list of all gateways
 * @returns {Promise<Array>} Array of gateway objects
 */
async function getAllGateways() {
  try {
    const result = await db.query(`
      SELECT 
        gateway_id,
        first_seen,
        last_seen,
        created_at,
        updated_at
      FROM gateways
      ORDER BY gateway_id
    `);
    
    return result.rows.map(row => ({
      gatewayId: row.gateway_id,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    console.error('Error fetching all gateways:', error);
    throw error;
  }
}

/**
 * Get metrics for a specific gateway with optional time-range filtering
 * Uses optimized query with idx_uplinks_gateway_id_timestamp index
 * 
 * @param {string} gatewayId - Gateway ID
 * @param {string} from - Optional ISO timestamp for start of range
 * @param {string} to - Optional ISO timestamp for end of range
 * @returns {Promise<Object|null>} Gateway metrics or null if not found
 */
async function getGatewayMetrics(gatewayId, from, to) {
  try {
    // Check if gateway exists
    const gatewayCheck = await db.query(`
      SELECT gateway_id FROM gateways WHERE gateway_id = $1
    `, [gatewayId]);
    
    if (gatewayCheck.rows.length === 0) {
      return null;
    }
    
    // Build time-range WHERE clause
    let timeRangeClause = '';
    const queryParams = [gatewayId];
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
    
    // Optimized query using idx_uplinks_gateway_id_timestamp index
    const result = await db.query(`
      SELECT 
        COUNT(u.id) as total_uplinks,
        ROUND(AVG(u.rf_score)::numeric, 2) as avg_rf_score,
        MIN(u.rf_score) as min_rf_score,
        MAX(u.rf_score) as max_rf_score,
        ROUND(AVG(u.rssi)::numeric, 2) as avg_rssi,
        ROUND(AVG(u.snr)::numeric, 2) as avg_snr,
        MIN(u.timestamp) as first_seen,
        MAX(u.timestamp) as last_seen,
        CASE 
          WHEN STDDEV(u.snr) <= 2 THEN 'STABLE'
          WHEN STDDEV(u.snr) <= 5 THEN 'UNSTABLE'
          ELSE 'VERY_UNSTABLE'
        END as stability_index
      FROM uplinks u
      WHERE u.gateway_id = $1
        ${timeRangeClause}
    `, queryParams);
    
    if (result.rows.length === 0 || result.rows[0].total_uplinks === '0') {
      return {
        gatewayId: gatewayId,
        totalUplinks: 0,
        avgRfScore: null,
        minRfScore: null,
        maxRfScore: null,
        avgRssi: null,
        avgSnr: null,
        firstSeen: null,
        lastSeen: null,
        stabilityIndex: 'UNKNOWN',
      };
    }
    
    const row = result.rows[0];
    
    return {
      gatewayId: gatewayId,
      totalUplinks: parseInt(row.total_uplinks, 10),
      avgRfScore: row.avg_rf_score ? parseFloat(row.avg_rf_score) : null,
      minRfScore: row.min_rf_score ? parseInt(row.min_rf_score, 10) : null,
      maxRfScore: row.max_rf_score ? parseInt(row.max_rf_score, 10) : null,
      avgRssi: row.avg_rssi ? parseFloat(row.avg_rssi) : null,
      avgSnr: row.avg_snr ? parseFloat(row.avg_snr) : null,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      stabilityIndex: row.stability_index || 'UNKNOWN',
    };
  } catch (error) {
    console.error('Error fetching gateway metrics:', error);
    throw error;
  }
}

module.exports = {
  getAllGateways,
  getGatewayHealth,
  getGatewayDetails,
  getGatewayMetrics,
};
