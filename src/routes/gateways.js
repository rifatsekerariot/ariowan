const express = require('express');
const router = express.Router();
const gatewayService = require('../services/gatewayService');
const logger = require('../utils/logger');

/**
 * GET /api/gateways
 * Get list of all gateways
 */
router.get('/gateways', async (req, res) => {
  try {
    const gateways = await gatewayService.getAllGateways();
    res.json(gateways);
  } catch (error) {
    logger.error('Error fetching gateways', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/gateways/health
 * Get health metrics for all gateways
 * Returns empty array [] if no data exists (not 404)
 */
router.get('/gateways/health', async (req, res) => {
  try {
    const gatewayHealth = await gatewayService.getGatewayHealth();
    // Always return array, even if empty
    res.json(gatewayHealth || []);
  } catch (error) {
    logger.error('Error fetching gateway health', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/gateways/:id/metrics
 * Get metrics for a specific gateway with optional time-range filtering
 * Query params: from (ISO timestamp), to (ISO timestamp)
 * 
 * NOTE: This route must come before /gateways/:gatewayId to avoid route conflicts
 */
router.get('/gateways/:id/metrics', async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;
    
    const metrics = await gatewayService.getGatewayMetrics(id, from, to);
    
    if (!metrics) {
      return res.status(404).json({ error: 'Gateway not found' });
    }
    
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching gateway metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/gateways/:gatewayId
 * Get detailed information for a specific gateway
 */
router.get('/gateways/:gatewayId', async (req, res) => {
  try {
    const { gatewayId } = req.params;
    const gatewayData = await gatewayService.getGatewayDetails(gatewayId);
    
    if (!gatewayData) {
      return res.status(404).json({ error: 'Gateway not found' });
    }
    
    res.json(gatewayData);
  } catch (error) {
    console.error('Error fetching gateway details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
