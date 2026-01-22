/**
 * Route logging utility
 * Extracts and logs all registered Express routes at startup
 */

/**
 * Extract all routes from Express app/router stack
 * @param {Array} stack - Express router stack
 * @param {string} basePath - Base path for nested routers
 * @returns {Array<Object>} Array of route objects
 */
function extractRoutesFromStack(stack, basePath = '') {
  const routes = [];
  
  if (!stack || !Array.isArray(stack)) {
    return routes;
  }
  
  stack.forEach(layer => {
    if (!layer) return;
    
    // Handle direct route
    if (layer.route) {
      const route = layer.route;
      const methods = Object.keys(route.methods).filter(m => route.methods[m] && m !== '_all');
      const path = (basePath + route.path).replace(/\/+/g, '/') || '/';
      
      methods.forEach(method => {
        routes.push({
          method: method.toUpperCase(),
          path: path,
          mount: basePath || '/',
        });
      });
    }
    // Handle router middleware (mounted routers)
    else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      // Extract mount path from regexp
      let mountPath = basePath;
      
      if (layer.regexp) {
        // Try to extract path from regexp
        const regexStr = layer.regexp.toString();
        // Match patterns like /^\/api\/?$/i or /^\/?$/i
        const pathMatch = regexStr.match(/\^([^$]*)\$\/i?/);
        if (pathMatch && pathMatch[1]) {
          mountPath = pathMatch[1]
            .replace(/\\\//g, '/')
            .replace(/\\\?/g, '')
            .replace(/\(/g, '')
            .replace(/\)/g, '')
            .replace(/\|/g, '')
            || '/';
        }
      }
      
      // Recursively extract routes from nested router
      const nestedRoutes = extractRoutesFromStack(layer.handle.stack, mountPath);
      routes.push(...nestedRoutes);
    }
  });
  
  return routes;
}

/**
 * Log all registered routes in a formatted way
 * @param {express.Application} app - Express application instance
 * @param {Object} logger - Logger utility
 */
function logRoutes(app, logger) {
  try {
    let routes = [];
    
    // Extract routes from app router stack
    if (app._router && app._router.stack) {
      routes = extractRoutesFromStack(app._router.stack);
    }
    
    if (routes.length === 0) {
      logger.warn('No routes found in Express app');
      return;
    }
    
    // Sort routes by path
    routes.sort((a, b) => {
      if (a.path !== b.path) {
        return a.path.localeCompare(b.path);
      }
      return a.method.localeCompare(b.method);
    });
    
    // Group routes by mount point
    const routesByMount = {};
    routes.forEach(route => {
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
        .map(r => `  ${r.method.padEnd(6)} ${r.path}`)
        .join('\n');
      
      logger.info(`Routes mounted at ${mount === '/' ? 'root' : mount}:\n${routeList}`);
    });
    
    // Complete route list for debugging
    const completeList = routes
      .map(r => `${r.method.padEnd(6)} ${r.path}`)
      .join('\n');
    logger.debug(`Complete route list (${routes.length} routes):\n${completeList}`);
    
  } catch (error) {
    logger.error('Error extracting routes', error);
  }
}

module.exports = {
  extractRoutesFromStack,
  logRoutes,
};
