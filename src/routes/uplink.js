const express = require('express');
const router = express.Router();
const uplinkService = require('../services/uplinkService');
const { rateLimitMiddleware } = require('../utils/rateLimiter');
const logger = require('../utils/logger');

/**
 * POST /
 * ChirpStack HTTP integration endpoint
 * Receives uplink events from ChirpStack
 * 
 * Rate limited to prevent abuse
 * Always returns HTTP 200 quickly after processing
 */
router.post('/', rateLimitMiddleware, async (req, res) => {
  // Return 200 immediately, process asynchronously
  res.status(200).send();
  
  try {
    // Normalize event value: handle both string and array cases
    let eventType = 'unknown';
    const eventQuery = req.query.event;
    
    if (Array.isArray(eventQuery)) {
      // If array, select the value that is not "{{event}}"
      const resolvedEvent = eventQuery.find(val => val !== '{{event}}');
      eventType = resolvedEvent || 'unknown';
    } else if (typeof eventQuery === 'string') {
      eventType = eventQuery;
    }
    
    const rawBodySize = req.get('content-length') || '0';
    
    logger.debug('Uplink event received', {
      eventType,
      bodySize: rawBodySize,
      ip: req.ip,
    });
    
    // Only process uplink events
    if (eventType === 'up') {
      await uplinkService.processUplink(req.body);
    } else {
      logger.debug('Non-uplink event ignored', { eventType });
    }
  } catch (error) {
    // Log error but don't return error to client (already sent 200)
    logger.error('Error processing uplink', {
      ip: req.ip,
      error: error.message,
      stack: error.stack,
    });
  }
});

module.exports = router;
