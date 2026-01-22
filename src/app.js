const express = require('express');
const db = require('./db/connection');
const logger = require('./utils/logger');
const routeTracker = require('./utils/routeTracker');
const { auditRoutes } = require('./utils/routeAuditor');

const app = express();
const PORT = process.env.PORT || 8090;

// Request size limits (10MB max for JSON payloads)
const MAX_REQUEST_SIZE = process.env.MAX_REQUEST_SIZE || '10mb';

// Middleware
app.use(express.json({ 
  limit: MAX_REQUEST_SIZE,
  strict: true,
}));

// Trust proxy for accurate IP addresses (important for rate limiting)
app.set('trust proxy', true);

// Global error handler
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logger.error('Invalid JSON payload', { 
      path: req.path,
      ip: req.ip,
      error: err.message,
    });
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  
  logger.error('Unhandled error', {
    path: req.path,
    ip: req.ip,
    error: err.message,
    stack: err.stack,
  });
  
  res.status(500).json({ error: 'Internal server error' });
});

let server = null;

// Initialize database on startup
db.initializeDatabase()
  .then(() => {
    logger.info('Database initialization complete');
    
    // Load routes after database is ready
    const healthRoutes = require('./routes/health');
    const uplinkRoutes = require('./routes/uplink');
    const lastUplinkRoutes = require('./routes/lastUplink');
    const gatewayRoutes = require('./routes/gateways');
    const deviceRoutes = require('./routes/devices');
    const networkHealthRoutes = require('./routes/networkHealth');
    
    // Register routes with tracking
    // Health check at root (standard for health checks)
    app.use('/', healthRoutes);
    routeTracker.trackRoute('GET', '/health', '/');
    
    // Webhook endpoint at root (ChirpStack integration)
    app.use('/', uplinkRoutes);
    routeTracker.trackRoute('POST', '/', '/');
    
    // All API routes under /api prefix
    app.use('/api', lastUplinkRoutes);
    routeTracker.trackRoute('GET', '/last-uplink', '/api');
    routeTracker.trackRoute('GET', '/uplinks/reliability', '/api');
    
    app.use('/api', gatewayRoutes);
    routeTracker.trackRoute('GET', '/gateways', '/api');
    routeTracker.trackRoute('GET', '/gateways/health', '/api');
    routeTracker.trackRoute('GET', '/gateways/:id/metrics', '/api');
    routeTracker.trackRoute('GET', '/gateways/:gatewayId', '/api');
    
    app.use('/api', deviceRoutes);
    routeTracker.trackRoute('GET', '/devices', '/api');
    routeTracker.trackRoute('GET', '/devices/health', '/api');
    routeTracker.trackRoute('GET', '/devices/silent', '/api');
    routeTracker.trackRoute('GET', '/devices/:eui/metrics', '/api');
    routeTracker.trackRoute('GET', '/devices/:devEui', '/api');
    
    app.use('/api', networkHealthRoutes);
    routeTracker.trackRoute('GET', '/network-health', '/api');
    
    // Log all registered routes at startup
    routeTracker.logRoutes(logger);
    
    // Audit routes to ensure they meet requirements
    const routes = routeTracker.getRoutes();
    auditRoutes(routes, logger);
    
    // 404 handler - must be after all routes are registered
    app.use((req, res) => {
      logger.warn('Route not found', { path: req.path, method: req.method });
      res.status(404).json({ error: 'Route not found' });
    });
    
    // Start server
    server = app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`, {
        port: PORT,
        maxRequestSize: MAX_REQUEST_SIZE,
        nodeEnv: process.env.NODE_ENV || 'development',
      });
    });
  })
  .catch((error) => {
    logger.error('Failed to initialize database', error);
    process.exit(1);
  });

// Graceful shutdown handler
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress, forcing exit');
    process.exit(1);
  }
  
  isShuttingDown = true;
  logger.info(`${signal} received, starting graceful shutdown`);
  
  // Stop accepting new connections
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }
  
  // Close database connections
  try {
    await db.close();
    logger.info('Database connections closed');
  } catch (error) {
    logger.error('Error closing database connections', error);
  }
  
  // Give in-flight requests time to complete (max 10 seconds)
  const shutdownTimeout = setTimeout(() => {
    logger.warn('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, 10000);
  
  // Wait for in-flight requests
  // In a production environment, you might want to track active requests
  setTimeout(() => {
    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  }, 2000); // Wait 2 seconds for in-flight requests
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  gracefulShutdown('uncaughtException').then(() => {
    process.exit(1);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  // Don't exit on unhandled rejection, but log it
});

module.exports = app;
