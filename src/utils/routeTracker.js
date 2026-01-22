/**
 * Route tracking utility
 * Manually tracks routes as they are registered for reliable logging
 */

const routes = [];

/**
 * Track a route registration
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - Route path
 * @param {string} mount - Mount point (base path)
 */
function trackRoute(method, path, mount = '/') {
  routes.push({
    method: method.toUpperCase(),
    path: path.startsWith('/') ? path : '/' + path,
    mount: mount,
    fullPath: mount === '/' ? path : mount + (path.startsWith('/') ? path : '/' + path),
  });
}

/**
 * Get all tracked routes
 * @returns {Array<Object>} Array of route objects
 */
function getRoutes() {
  return [...routes];
}

/**
 * Clear all tracked routes (for testing)
 */
function clearRoutes() {
  routes.length = 0;
}

/**
 * Log all tracked routes
 * @param {Object} logger - Logger utility
 */
function logRoutes(logger) {
  if (routes.length === 0) {
    logger.warn('No routes tracked');
    return;
  }
  
  // Sort routes by mount point, then by path, then by method
  const sortedRoutes = [...routes].sort((a, b) => {
    if (a.mount !== b.mount) {
      return a.mount.localeCompare(b.mount);
    }
    if (a.path !== b.path) {
      return a.path.localeCompare(b.path);
    }
    return a.method.localeCompare(b.method);
  });
  
  // Group by mount point
  const routesByMount = {};
  sortedRoutes.forEach(route => {
    const mount = route.mount || '/';
    if (!routesByMount[mount]) {
      routesByMount[mount] = [];
    }
    routesByMount[mount].push(route);
  });
  
  // Log summary
  logger.info('Registered Express routes', {
    totalRoutes: routes.length,
    mountPoints: Object.keys(routesByMount).length,
  });
  
  // Log routes grouped by mount point
  Object.keys(routesByMount).sort().forEach(mount => {
    const mountRoutes = routesByMount[mount];
    const routeList = mountRoutes
      .map(r => `  ${r.method.padEnd(6)} ${r.fullPath}`)
      .join('\n');
    
    const mountLabel = mount === '/' ? 'root (/)' : mount;
    logger.info(`Routes mounted at ${mountLabel}:\n${routeList}`);
  });
  
  // Complete route list for debugging
  const completeList = sortedRoutes
    .map(r => `${r.method.padEnd(6)} ${r.fullPath}`)
    .join('\n');
  logger.debug(`Complete route list (${routes.length} routes):\n${completeList}`);
}

module.exports = {
  trackRoute,
  getRoutes,
  clearRoutes,
  logRoutes,
};
