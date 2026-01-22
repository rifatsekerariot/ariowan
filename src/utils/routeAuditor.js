/**
 * Route auditor utility
 * Verifies route structure meets requirements:
 * - All API routes are mounted under /api
 * - Webhook POST / is mounted at root
 */

/**
 * Audit routes to ensure they meet requirements
 * @param {Array<Object>} routes - Array of tracked routes
 * @param {Object} logger - Logger utility
 * @returns {boolean} True if all requirements are met
 */
function auditRoutes(routes, logger) {
  const issues = [];
  
  // Check that webhook POST / is at root
  const webhookRoute = routes.find(r => 
    r.method === 'POST' && r.fullPath === '/'
  );
  
  if (!webhookRoute) {
    issues.push('Webhook POST / must be mounted at root');
  } else if (webhookRoute.mount !== '/') {
    issues.push(`Webhook POST / is mounted at ${webhookRoute.mount}, should be at root`);
  }
  
  // Check that all API routes are under /api
  const apiRoutes = routes.filter(r => 
    r.fullPath.startsWith('/api/') || r.fullPath === '/api'
  );
  
  const nonApiRoutes = routes.filter(r => 
    !r.fullPath.startsWith('/api/') && 
    r.fullPath !== '/api' &&
    r.fullPath !== '/health' &&
    r.fullPath !== '/'
  );
  
  if (nonApiRoutes.length > 0) {
    issues.push(`Found ${nonApiRoutes.length} non-API routes not under /api: ${nonApiRoutes.map(r => r.fullPath).join(', ')}`);
  }
  
  // Health check can be at root (standard practice)
  const healthRoute = routes.find(r => r.fullPath === '/health');
  if (healthRoute && healthRoute.mount !== '/') {
    issues.push(`Health check /health is mounted at ${healthRoute.mount}, should be at root`);
  }
  
  if (issues.length > 0) {
    logger.warn('Route audit found issues:', { issues });
    return false;
  }
  
  logger.debug('Route audit passed: all routes meet requirements');
  return true;
}

module.exports = {
  auditRoutes,
};
