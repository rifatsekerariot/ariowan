const express = require('express');
const router = express.Router();
const uplinkService = require('../services/uplinkService');
const { rateLimitMiddleware } = require('../utils/rateLimiter');
const logger = require('../utils/logger');

/**
 * Detect event type from multiple sources (query, headers, payload)
 * ChirpStack can send event type in different ways
 * @param {Object} req - Express request object
 * @returns {string} Event type or 'unknown'
 */
function detectEventType(req) {
  // 1. Check query parameter (most common: ?event=up)
  const eventQuery = req.query.event;
  if (eventQuery) {
    if (Array.isArray(eventQuery)) {
      // If array, select the value that is not "{{event}}"
      const resolvedEvent = eventQuery.find(val => val !== '{{event}}');
      if (resolvedEvent) {
        return resolvedEvent;
      }
    } else if (typeof eventQuery === 'string') {
      return eventQuery;
    }
  }
  
  // 2. Check headers (X-Event-Type, Event-Type, etc.)
  const headerEvent = req.get('x-event-type') || 
                      req.get('event-type') || 
                      req.get('x-chirpstack-event');
  if (headerEvent) {
    return headerEvent.toLowerCase();
  }
  
  // 3. Check payload (payload.eventType, payload.event, etc.)
  if (req.body) {
    const payloadEvent = req.body.eventType || 
                        req.body.event || 
                        req.body.type;
    if (payloadEvent) {
      return typeof payloadEvent === 'string' ? payloadEvent.toLowerCase() : payloadEvent;
    }
  }
  
  return 'unknown';
}

/**
 * POST /
 * ChirpStack HTTP integration endpoint
 * Receives uplink events from ChirpStack
 * 
 * Requirements:
 * - Accept JSON body
 * - Detect event type from query, headers, or payload
 * - Extract: gateway_id, dev_eui, rssi, snr, timestamp
 * - Insert into uplinks table
 * 
 * Rate limited to prevent abuse
 * Always returns HTTP 200 quickly after processing
 */
router.post('/', rateLimitMiddleware, async (req, res) => {
  // Return 200 immediately, process asynchronously
  res.status(200).send();
  
  try {
    // Detect event type from multiple sources
    const eventType = detectEventType(req);
    
    const rawBodySize = req.get('content-length') || '0';
    
    logger.debug('Webhook request received', {
      eventType,
      bodySize: rawBodySize,
      ip: req.ip,
      hasBody: !!req.body,
    });
    
    // Only process uplink events
    if (eventType === 'up' || eventType === 'uplink') {
      await uplinkService.processUplink(req.body);
    } else {
      logger.debug('Non-uplink event ignored', { 
        eventType,
        ip: req.ip,
      });
    }
  } catch (error) {
    // Log error but don't return error to client (already sent 200)
    logger.error('Error processing webhook', {
      ip: req.ip,
      error: error.message,
      stack: error.stack,
    });
  }
});

module.exports = router;
