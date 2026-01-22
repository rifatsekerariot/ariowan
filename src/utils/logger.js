/**
 * Simple structured logging utility
 * Provides consistent log format for production observability
 */

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/**
 * Format log message with timestamp and level
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} meta - Additional metadata
 * @returns {string} Formatted log message
 */
function formatLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

/**
 * Log error
 * @param {string} message - Error message
 * @param {Error|Object} error - Error object or metadata
 */
function error(message, error = {}) {
  if (LOG_LEVELS[LOG_LEVEL] >= LOG_LEVELS.error) {
    const errorDetails = error instanceof Error
      ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
        }
      : error;
    
    console.error(formatLog('error', message, errorDetails));
  }
}

/**
 * Log warning
 * @param {string} message - Warning message
 * @param {Object} meta - Additional metadata
 */
function warn(message, meta = {}) {
  if (LOG_LEVELS[LOG_LEVEL] >= LOG_LEVELS.warn) {
    console.warn(formatLog('warn', message, meta));
  }
}

/**
 * Log info
 * @param {string} message - Info message
 * @param {Object} meta - Additional metadata
 */
function info(message, meta = {}) {
  if (LOG_LEVELS[LOG_LEVEL] >= LOG_LEVELS.info) {
    console.log(formatLog('info', message, meta));
  }
}

/**
 * Log debug
 * @param {string} message - Debug message
 * @param {Object} meta - Additional metadata
 */
function debug(message, meta = {}) {
  if (LOG_LEVELS[LOG_LEVEL] >= LOG_LEVELS.debug) {
    console.log(formatLog('debug', message, meta));
  }
}

module.exports = {
  error,
  warn,
  info,
  debug,
};
