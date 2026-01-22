const express = require('express');
const router = express.Router();
const uplinkService = require('../services/uplinkService');
const logger = require('../utils/logger');

/**
 * GET /api/last-uplink
 * Get the most recent uplink across all gateways
 * Returns empty JSON object {} if no data exists (not 404)
 */
router.get('/last-uplink', async (req, res) => {
  try {
    const lastUplink = await uplinkService.getLastUplink();
    
    // Return empty object if no data, not 404
    if (!lastUplink) {
      return res.json({});
    }
    
    res.json(lastUplink);
  } catch (error) {
    logger.error('Error fetching last uplink', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/uplinks/reliability
 * Get uplink reliability metrics for the last 1 hour
 * Returns stddev_snr, stddev_rssi, and classification (Stable/Unstable)
 */
router.get('/uplinks/reliability', async (req, res) => {
  try {
    const reliability = await uplinkService.getUplinkReliability();
    res.json(reliability);
  } catch (error) {
    logger.error('Error fetching uplink reliability', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
