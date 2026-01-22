const express = require('express');
const router = express.Router();
const uplinkService = require('../services/uplinkService');
const deviceStatusService = require('../services/deviceStatusService');
const deviceJoinService = require('../services/deviceJoinService');
const deviceDownlinkService = require('../services/deviceDownlinkService');
const deviceLogService = require('../services/deviceLogService');
const deviceLocationService = require('../services/deviceLocationService');
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
 * Event dispatch: route by event type. No business logic for non-up events yet.
 * Clean dispatch layer without changing existing behavior.
 * @param {string} eventType - Detected event type
 * @param {Object} payload - Request body payload
 * @param {string} ip - Client IP (for logging)
 */
async function dispatchEvent(eventType, payload, ip) {
  // Normalize event type to lowercase for consistent matching
  const normalizedType = eventType.toLowerCase();
  
  switch (normalizedType) {
    case 'up':
    case 'uplink':
      // Existing uplink processing - no changes
      await uplinkService.processUplink(payload);
      break;
      
    case 'status':
      // Device status event (battery, margin, etc.)
      await deviceStatusService.processStatus(payload);
      break;
      
    case 'join':
      // Device join event (OTAA activation)
      await deviceJoinService.processJoin(payload);
      break;
      
    case 'ack':
      // Application-level acknowledgment
      await deviceDownlinkService.processAck(payload);
      break;
      
    case 'txack':
      // Transmission acknowledgment
      await deviceDownlinkService.processTxAck(payload);
      break;
      
    case 'log':
      // Device log event (ERROR and WARN levels only)
      await deviceLogService.processLog(payload);
      break;
      
    case 'location':
      // Device location event (GPS, WiFi, etc.)
      await deviceLocationService.processLocation(payload);
      break;
      
    default:
      // Unknown event type - log and ignore
      logger.info('Unknown event type received', {
        eventType: normalizedType,
        originalEventType: eventType,
        ip,
      });
      break;
  }
}

/**
 * POST /
 * ChirpStack HTTP integration endpoint
 * Receives events from ChirpStack v4 HTTP integration
 *
 * - Detect event type from query, headers, or payload (body)
 * - Supported: up, status, join, ack, txack, log, location
 * - Unknown types logged and ignored
 * - up/uplink: insert into uplinks table
 *
 * Rate limited. Always returns HTTP 200 quickly.
 */
router.post('/', rateLimitMiddleware, async (req, res) => {
  res.status(200).send();

  try {
    const rawEventType = detectEventType(req);
    const eventType = typeof rawEventType === 'string' ? rawEventType.toLowerCase() : String(rawEventType);
    const rawBodySize = req.get('content-length') || '0';

    logger.debug('Webhook request received', {
      eventType,
      bodySize: rawBodySize,
      ip: req.ip,
      hasBody: !!req.body,
    });

    await dispatchEvent(eventType, req.body, req.ip);
  } catch (error) {
    logger.error('Error processing webhook', {
      ip: req.ip,
      error: error.message,
      stack: error.stack,
    });
  }
});

module.exports = router;
