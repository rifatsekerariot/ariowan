/**
 * Simple in-memory rate limiter
 * Tracks requests per IP address with sliding window
 * 
 * This is a minimal implementation for production use.
 * For distributed systems, consider Redis-based rate limiting.
 */

class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map(); // IP -> [timestamps]
  }

  /**
   * Check if request should be allowed
   * @param {string} identifier - IP address or identifier
   * @returns {boolean} True if request is allowed
   */
  isAllowed(identifier) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get or create request history for this identifier
    if (!this.requests.has(identifier)) {
      this.requests.set(identifier, []);
    }

    const requestTimes = this.requests.get(identifier);

    // Remove old requests outside the window
    while (requestTimes.length > 0 && requestTimes[0] < windowStart) {
      requestTimes.shift();
    }

    // Check if limit exceeded
    if (requestTimes.length >= this.maxRequests) {
      return false;
    }

    // Add current request
    requestTimes.push(now);
    return true;
  }

  /**
   * Get remaining requests for identifier
   * @param {string} identifier - IP address or identifier
   * @returns {number} Remaining requests in current window
   */
  getRemaining(identifier) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (!this.requests.has(identifier)) {
      return this.maxRequests;
    }

    const requestTimes = this.requests.get(identifier);

    // Remove old requests
    while (requestTimes.length > 0 && requestTimes[0] < windowStart) {
      requestTimes.shift();
    }

    return Math.max(0, this.maxRequests - requestTimes.length);
  }

  /**
   * Clean up old entries (call periodically to prevent memory leak)
   */
  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [identifier, requestTimes] of this.requests.entries()) {
      // Remove old requests
      while (requestTimes.length > 0 && requestTimes[0] < windowStart) {
        requestTimes.shift();
      }

      // Remove empty entries
      if (requestTimes.length === 0) {
        this.requests.delete(identifier);
      }
    }
  }
}

// Create rate limiter instance for webhook endpoint
// Default: 100 requests per minute per IP
const WEBHOOK_RATE_LIMIT = parseInt(process.env.WEBHOOK_RATE_LIMIT || '100', 10);
const WEBHOOK_RATE_WINDOW_MS = parseInt(process.env.WEBHOOK_RATE_WINDOW_MS || '60000', 10); // 1 minute

const webhookRateLimiter = new RateLimiter(WEBHOOK_RATE_LIMIT, WEBHOOK_RATE_WINDOW_MS);

// Cleanup old entries every 5 minutes
setInterval(() => {
  webhookRateLimiter.cleanup();
}, 5 * 60 * 1000);

/**
 * Rate limit middleware for webhook endpoint
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
function rateLimitMiddleware(req, res, next) {
  // Get client IP (consider X-Forwarded-For header for proxies)
  const clientIp = req.ip || 
                   req.connection.remoteAddress || 
                   req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                   'unknown';

  if (!webhookRateLimiter.isAllowed(clientIp)) {
    const remaining = webhookRateLimiter.getRemaining(clientIp);
    const retryAfter = Math.ceil(WEBHOOK_RATE_WINDOW_MS / 1000);
    
    res.status(429).json({
      error: 'Too many requests',
      message: `Rate limit exceeded. Maximum ${WEBHOOK_RATE_LIMIT} requests per ${WEBHOOK_RATE_WINDOW_MS / 1000} seconds.`,
      retryAfter: retryAfter,
    });
    return;
  }

  // Add rate limit headers
  const remaining = webhookRateLimiter.getRemaining(clientIp);
  res.setHeader('X-RateLimit-Limit', WEBHOOK_RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', new Date(Date.now() + WEBHOOK_RATE_WINDOW_MS).toISOString());

  next();
}

module.exports = {
  rateLimitMiddleware,
  webhookRateLimiter,
};
