const express = require('express');
const router = express.Router();
const uplinkService = require('../services/uplinkService');

/**
 * GET /api/last-uplink
 * Get the most recent uplink across all gateways
 * Returns 204 if no uplinks exist
 */
router.get('/last-uplink', async (req, res) => {
  try {
    const lastUplink = await uplinkService.getLastUplink();
    
    if (!lastUplink) {
      return res.status(204).send();
    }
    
    res.json(lastUplink);
  } catch (error) {
    console.error('Error fetching last uplink:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
