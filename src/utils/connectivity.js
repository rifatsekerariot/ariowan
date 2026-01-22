const EXPECTED_UPLINK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const OFFLINE_THRESHOLD_MS = 5 * EXPECTED_UPLINK_INTERVAL_MS; // 75 minutes

/**
 * Calculate uplink continuity status
 * @param {string|Date} lastSeenTimestamp - Last seen timestamp
 * @returns {string} Connectivity status (ONLINE, OFFLINE, UNKNOWN)
 */
function calculateUplinkContinuity(lastSeenTimestamp) {
  if (!lastSeenTimestamp) return 'UNKNOWN';
  
  const now = new Date().getTime();
  const lastSeen = new Date(lastSeenTimestamp).getTime();
  const timeSinceLastUplink = now - lastSeen;
  
  if (timeSinceLastUplink > OFFLINE_THRESHOLD_MS) {
    return 'OFFLINE';
  } else {
    return 'ONLINE';
  }
}

module.exports = {
  calculateUplinkContinuity,
};
