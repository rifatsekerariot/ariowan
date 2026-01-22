const db = require('../db/connection');

/**
 * Calculate standard deviation of values
 * @param {Array<number>} values - Array of numeric values
 * @returns {number} Standard deviation
 */
function calculateStdDev(values) {
  if (values.length === 0) return 0;
  
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Calculate stability index based on SNR standard deviation
 * @param {Array<number>} snrValues - Array of SNR values
 * @returns {string} Stability index (STABLE, UNSTABLE, VERY_UNSTABLE)
 */
function calculateStabilityIndex(snrValues) {
  if (snrValues.length === 0) return 'UNKNOWN';
  
  const stddev = calculateStdDev(snrValues);
  
  if (stddev <= 2) {
    return 'STABLE';
  } else if (stddev <= 5) {
    return 'UNSTABLE';
  } else {
    return 'VERY_UNSTABLE';
  }
}

/**
 * Calculate stability index for a gateway from database
 * @param {string} gatewayId - Gateway ID
 * @returns {Promise<string>} Stability index
 */
async function calculateStabilityIndexForGateway(gatewayId) {
  try {
    const result = await db.query(`
      SELECT snr
      FROM uplinks
      WHERE gateway_id = $1
        AND timestamp >= NOW() - INTERVAL '1 hour'
      ORDER BY timestamp DESC
      LIMIT 20
    `, [gatewayId]);
    
    if (result.rows.length === 0) {
      return 'UNKNOWN';
    }
    
    const snrValues = result.rows.map(row => parseFloat(row.snr));
    return calculateStabilityIndex(snrValues);
  } catch (error) {
    console.error('Error calculating stability index:', error);
    return 'UNKNOWN';
  }
}

module.exports = {
  calculateStdDev,
  calculateStabilityIndex,
  calculateStabilityIndexForGateway,
};
