#!/bin/sh
# Health check script for Docker
# Checks GET /health endpoint and validates db_connected and tables_ready

node - <<'NODE_SCRIPT'
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 8090,
  path: '/health',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const health = JSON.parse(data);
      
      if (health.db_connected === true && health.tables_ready === true) {
        process.exit(0);
      } else {
        console.error('Health check failed:', JSON.stringify(health));
        process.exit(1);
      }
    } catch (error) {
      console.error('Failed to parse health response:', error.message);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('Health check request failed:', error.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('Health check timeout');
  req.destroy();
  process.exit(1);
});

req.end();
NODE_SCRIPT
