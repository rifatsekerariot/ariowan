const express = require('express');
const router = express.Router();
const deviceService = require('../services/deviceService');

/**
 * GET /api/devices
 * Get list of all devices
 */
router.get('/devices', async (req, res) => {
  try {
    const devices = await deviceService.getAllDevices();
    res.json(devices);
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/devices/health
 * Get health metrics for all devices
 */
router.get('/devices/health', async (req, res) => {
  try {
    const deviceHealth = await deviceService.getDeviceHealth();
    res.json(deviceHealth);
  } catch (error) {
    console.error('Error fetching device health:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/devices/:eui/metrics
 * Get metrics for a specific device with optional time-range filtering
 * Query params: from (ISO timestamp), to (ISO timestamp)
 * 
 * NOTE: This route must come before /devices/:devEui to avoid route conflicts
 */
router.get('/devices/:eui/metrics', async (req, res) => {
  try {
    const { eui } = req.params;
    const { from, to } = req.query;
    
    const metrics = await deviceService.getDeviceMetrics(eui, from, to);
    
    if (!metrics) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching device metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/devices/:devEui
 * Get detailed information for a specific device
 */
router.get('/devices/:devEui', async (req, res) => {
  try {
    const { devEui } = req.params;
    const deviceData = await deviceService.getDeviceDetails(devEui);
    
    if (!deviceData) {
      return res.status(404).json({ error: 'Device not found or no uplinks received' });
    }
    
    res.json(deviceData);
  } catch (error) {
    console.error('Error fetching device details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
