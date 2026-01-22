/**
 * RF Scoring Service
 * 
 * Calculates RF score using a simple deterministic formula:
 * rf_score = (snr * 2) + (rssi / 10)
 * 
 * This formula is:
 * - Deterministic: Same inputs always produce same output
 * - Reproducible: Can be recalculated from stored rssi/snr values
 * - Simple: No complex business logic or thresholds
 * 
 * @param {number} snr - Signal-to-Noise Ratio (typically positive, e.g., 7 dB)
 * @param {number} rssi - Received Signal Strength Indicator (typically negative, e.g., -90 dBm)
 * @returns {number} RF score (integer, rounded)
 * 
 * @example
 * calculateRfScore(7, -90)  // (7 * 2) + (-90 / 10) = 14 + (-9) = 5
 * calculateRfScore(10, -80)  // (10 * 2) + (-80 / 10) = 20 + (-8) = 12
 */
function calculateRfScore(snr, rssi) {
  // Validate inputs
  if (typeof snr !== 'number' || isNaN(snr)) {
    throw new Error('SNR must be a valid number');
  }
  
  if (typeof rssi !== 'number' || isNaN(rssi)) {
    throw new Error('RSSI must be a valid number');
  }
  
  // Calculate: rf_score = (snr * 2) + (rssi / 10)
  const score = (snr * 2) + (rssi / 10);
  
  // Round to integer (rf_score is INTEGER in database)
  return Math.round(score);
}

module.exports = {
  calculateRfScore,
};
