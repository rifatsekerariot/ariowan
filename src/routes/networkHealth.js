const express = require('express');
const router = express.Router();
const networkHealthService = require('../services/networkHealthService');
const logger = require('../utils/logger');

/**
 * GET /api/network-health
 * Get composite Network Health Score
 * 
 * Returns:
 * - score: Overall health score (0-100)
 * - components: Breakdown of individual component scores
 * - timestamp: Calculation timestamp
 */
router.get('/network-health', async (req, res) => {
  try {
    const healthData = await networkHealthService.calculateNetworkHealth();
    res.json(healthData);
  } catch (error) {
    logger.error('Error fetching network health', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
