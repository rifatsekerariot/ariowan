/**
 * RF Scoring Service
 * 
 * Provides RF score calculation functionality.
 * This service implements a simple, deterministic formula for calculating
 * RF quality scores based on SNR and RSSI values.
 * 
 * The score is calculated during uplink insertion and stored in the
 * uplinks.rf_score column for efficient querying and aggregation.
 */

const { calculateRfScore } = require('../utils/rfScore');

/**
 * Calculate RF score for an uplink
 * 
 * This is a synchronous, deterministic function that can be called
 * during uplink processing without async overhead.
 * 
 * @param {number} snr - Signal-to-Noise Ratio (dB)
 * @param {number} rssi - Received Signal Strength Indicator (dBm)
 * @returns {number} RF score (integer)
 * 
 * @throws {Error} If inputs are invalid
 */
function calculateUplinkRfScore(snr, rssi) {
  return calculateRfScore(snr, rssi);
}

/**
 * Batch calculate RF scores for multiple uplinks
 * Useful for bulk operations or recalculation
 * 
 * @param {Array<{snr: number, rssi: number}>} uplinks - Array of uplink objects with snr and rssi
 * @returns {Array<number>} Array of RF scores
 */
function calculateBatchRfScores(uplinks) {
  return uplinks.map(uplink => calculateRfScore(uplink.snr, uplink.rssi));
}

module.exports = {
  calculateUplinkRfScore,
  calculateBatchRfScores,
};
