const express = require('express');

const app = express();
const PORT = process.env.PORT || 8090;

// In-memory storage per gateway: { gatewayId: [uplink1, uplink2, ...] }
const gatewayUplinks = {};

// In-memory storage per device: { devEui: [uplink1, uplink2, ...] }
const deviceUplinksHistory = {};

// Track recent uplinks by devEui for best gateway comparison
// Structure: { devEui: [{ timestamp, gatewayId, rfScore, isBest }, ...] }
const deviceUplinks = {};
const UPLINK_COMPARISON_WINDOW_MS = 5000; // 5 seconds window for comparing uplinks

// Uplink continuity constants
const EXPECTED_UPLINK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes in milliseconds
const OFFLINE_THRESHOLD_MS = 5 * EXPECTED_UPLINK_INTERVAL_MS; // 5 × expected interval

// Calculate RF score based on SNR and RSSI
function calculateRfScore(snr, rssi) {
  if (snr >= 7 && rssi >= -90) {
    return 100;
  } else if (snr >= 3 && rssi >= -105) {
    return 70;
  } else {
    return 40;
  }
}

// Calculate standard deviation of SNR values
function calculateStdDev(values) {
  if (values.length === 0) return 0;
  
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

// Calculate stability index based on SNR standard deviation
function calculateStabilityIndex(snrValues) {
  if (snrValues.length === 0) return 'UNKNOWN';
  
  const stddev = calculateStdDev(snrValues);
  
  if (stddev <= 2) {
    return 'STABLE';
  } else if (stddev <= 5) {
    return 'UNSTABLE';
  } else {
    return 'VERY_UNSTABLE';
  }
}

// Calculate uplink continuity status
function calculateUplinkContinuity(lastSeenTimestamp) {
  if (!lastSeenTimestamp) return 'UNKNOWN';
  
  const now = new Date().getTime();
  const lastSeen = new Date(lastSeenTimestamp).getTime();
  const timeSinceLastUplink = now - lastSeen;
  
  if (timeSinceLastUplink > OFFLINE_THRESHOLD_MS) {
    return 'OFFLINE';
  } else {
    return 'ONLINE';
  }
}

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get last uplink endpoint (returns most recent across all gateways for backward compatibility)
app.get('/api/last-uplink', (req, res) => {
  let mostRecentUplink = null;
  let mostRecentTimestamp = null;
  
  // Find the most recent uplink across all gateways
  for (const gatewayId in gatewayUplinks) {
    const uplinks = gatewayUplinks[gatewayId];
    if (uplinks.length > 0) {
      const lastUplink = uplinks[uplinks.length - 1];
      if (!mostRecentTimestamp || lastUplink.timestamp > mostRecentTimestamp) {
        mostRecentTimestamp = lastUplink.timestamp;
        mostRecentUplink = lastUplink;
      }
    }
  }
  
  if (mostRecentUplink) {
    res.json(mostRecentUplink);
  } else {
    res.status(204).send();
  }
});

// Get gateways health endpoint
app.get('/api/gateways/health', (req, res) => {
  const gatewayHealth = [];
  
  // Count total gateways tracked
  const totalGateways = Object.keys(gatewayUplinks).length;
  console.log(`Gateways tracked: ${totalGateways}`);
  
  for (const gatewayId in gatewayUplinks) {
    const uplinks = gatewayUplinks[gatewayId];
    
    if (uplinks.length === 0) {
      continue;
    }
    
    // Get last 20 uplinks (or fewer if not available)
    const lastUplinks = uplinks.slice(-20);
    
    // Calculate average rfScore
    const sum = lastUplinks.reduce((acc, uplink) => acc + uplink.rfScore, 0);
    const avgScore = sum / lastUplinks.length;
    
    // Determine status based on avgScore
    let status;
    if (avgScore >= 80) {
      status = 'HEALTHY';
    } else if (avgScore >= 50) {
      status = 'DEGRADED';
    } else {
      status = 'CRITICAL';
    }
    
    // Get lastSeen from most recent uplink
    const lastSeen = uplinks[uplinks.length - 1].timestamp;
    
    // Calculate stability index from SNR values
    const snrValues = lastUplinks.map(uplink => uplink.snr);
    const stabilityIndex = calculateStabilityIndex(snrValues);
    
    gatewayHealth.push({
      gatewayId,
      avgScore: Math.round(avgScore * 100) / 100, // Round to 2 decimal places
      status,
      lastSeen,
      stabilityIndex
    });
  }
  
  res.json(gatewayHealth);
});

// Get specific gateway endpoint
app.get('/api/gateways/:gatewayId', (req, res) => {
  const gatewayId = req.params.gatewayId;
  const uplinks = gatewayUplinks[gatewayId];
  
  // Return 404 if gateway not found
  if (!uplinks || uplinks.length === 0) {
    return res.status(404).json({ error: 'Gateway not found' });
  }
  
  // Get last 20 uplinks
  const lastUplinks = uplinks.slice(-20);
  
  // Calculate healthScore (average rfScore of last 20 uplinks)
  const sum = lastUplinks.reduce((acc, uplink) => acc + uplink.rfScore, 0);
  const healthScore = Math.round((sum / lastUplinks.length) * 100) / 100;
  
  // Determine status based on healthScore
  let status;
  if (healthScore >= 80) {
    status = 'HEALTHY';
  } else if (healthScore >= 50) {
    status = 'DEGRADED';
  } else {
    status = 'CRITICAL';
  }
  
  // Format uplinks (exclude gatewayId from each uplink object)
  const formattedUplinks = lastUplinks.map(uplink => ({
    timestamp: uplink.timestamp,
    devEui: uplink.devEui,
    rssi: uplink.rssi,
    snr: uplink.snr,
    rfScore: uplink.rfScore
  }));
  
  // Calculate stability index from SNR values
  const snrValues = lastUplinks.map(uplink => uplink.snr);
  const stabilityIndex = calculateStabilityIndex(snrValues);
  
  res.json({
    gatewayId,
    healthScore,
    status,
    stabilityIndex,
    uplinks: formattedUplinks
  });
});

// ChirpStack HTTP integration endpoint
app.post('/', (req, res) => {
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
  
  console.log('Event type (resolved):', eventType);
  console.log('Raw request body size:', rawBodySize, 'bytes');
  
  if (eventType === 'up') {
    const payload = req.body;
    
    // Extract deviceInfo.devEui
    const devEui = payload.deviceInfo?.devEui;
    
    // Extract rxInfo array
    const rxInfo = payload.rxInfo || [];
    
    console.log(`devEui: ${devEui}`);
    console.log(`rxInfo count: ${rxInfo.length}`);
    
    // Process each rxInfo item
    rxInfo.forEach((rxItem, index) => {
      const gatewayId = rxItem?.gatewayId;
      const rssi = rxItem?.rssi;
      const snr = rxItem?.snr;
      const time = rxItem?.time || new Date().toISOString();
      
      console.log(`rxInfo[${index}]: gatewayId=${gatewayId}, rssi=${rssi}, snr=${snr}, time=${time}`);
      
      if (gatewayId && devEui) {
        // Compute rfScore using existing rules
        const rfScore = calculateRfScore(snr, rssi);
        // Use time from rxInfo if available, otherwise use now
        const timestamp = time || new Date().toISOString();
        const timestampMs = new Date(timestamp).getTime();
        
        // Create uplink record with computed rfScore
        const uplinkRecord = {
          timestamp,
          devEui,
          gatewayId,
          rssi,
          snr,
          rfScore,
          isBest: false
        };
        
        // Track by devEui for best gateway comparison
        if (!deviceUplinks[devEui]) {
          deviceUplinks[devEui] = [];
        }
        
        // Find all recent uplinks from same device across all gateways
        const recentUplinks = [];
        for (const gId in gatewayUplinks) {
          const uplinks = gatewayUplinks[gId];
          uplinks.forEach(uplink => {
            if (uplink.devEui === devEui) {
              const uTime = new Date(uplink.timestamp).getTime();
              if (Math.abs(timestampMs - uTime) <= UPLINK_COMPARISON_WINDOW_MS) {
                recentUplinks.push({
                  gatewayId: gId,
                  timestamp: uplink.timestamp,
                  rfScore: uplink.rfScore,
                  uplinkRef: uplink
                });
              }
            }
          });
        }
        
        // Add current uplink to comparison set
        recentUplinks.push({
          gatewayId,
          timestamp,
          rfScore,
          uplinkRef: uplinkRecord
        });
        
        // Find best rfScore in comparison set
        const bestRfScore = Math.max(...recentUplinks.map(u => u.rfScore));
        
        // Mark the best uplink(s) and unmark others
        recentUplinks.forEach(u => {
          if (u.rfScore === bestRfScore) {
            u.uplinkRef.isBest = true;
          } else if (u.uplinkRef.isBest) {
            u.uplinkRef.isBest = false;
          }
        });
        
        // Add to device tracking (keep last 100 per device)
        if (!deviceUplinks[devEui]) {
          deviceUplinks[devEui] = [];
        }
        deviceUplinks[devEui].push({ timestamp, gatewayId, rfScore, isBest: uplinkRecord.isBest });
        if (deviceUplinks[devEui].length > 100) {
          deviceUplinks[devEui] = deviceUplinks[devEui].slice(-100);
        }
        
        // Store data in gateway buffer (by gatewayId)
        if (!gatewayUplinks[gatewayId]) {
          gatewayUplinks[gatewayId] = [];
        }
        gatewayUplinks[gatewayId].push(uplinkRecord);
        if (gatewayUplinks[gatewayId].length > 50) {
          gatewayUplinks[gatewayId] = gatewayUplinks[gatewayId].slice(-50);
        }
        
        // Store data in device buffer (by devEui)
        if (!deviceUplinksHistory[devEui]) {
          deviceUplinksHistory[devEui] = [];
        }
        const deviceUplinkRecord = {
          timestamp,
          gatewayId,
          rssi,
          snr,
          rfScore
        };
        deviceUplinksHistory[devEui].push(deviceUplinkRecord);
        if (deviceUplinksHistory[devEui].length > 50) {
          deviceUplinksHistory[devEui] = deviceUplinksHistory[devEui].slice(-50);
        }
      }
    });
  }
  
  res.status(200).send();
});

// Get devices health endpoint
app.get('/api/devices/health', (req, res) => {
  const deviceHealth = [];
  
  // Count total devices tracked
  const totalDevices = Object.keys(deviceUplinksHistory).length;
  console.log(`Devices tracked: ${totalDevices}`);
  
  for (const devEui in deviceUplinksHistory) {
    const uplinks = deviceUplinksHistory[devEui];
    
    if (uplinks.length === 0) {
      deviceHealth.push({
        devEui,
        avgScore: null,
        rfStatus: 'UNKNOWN',
        connectivityStatus: 'UNKNOWN',
        lastSeen: null
      });
      continue;
    }
    
    // Get last 20 uplinks (or fewer if not available)
    const lastUplinks = uplinks.slice(-20);
    
    // Calculate average rfScore
    const sum = lastUplinks.reduce((acc, uplink) => acc + uplink.rfScore, 0);
    const avgScore = sum / lastUplinks.length;
    
    // Determine rfStatus based on avgScore
    let rfStatus;
    if (avgScore >= 80) {
      rfStatus = 'HEALTHY';
    } else if (avgScore >= 50) {
      rfStatus = 'DEGRADED';
    } else {
      rfStatus = 'CRITICAL';
    }
    
    // Get lastSeen from most recent uplink
    const lastSeen = uplinks[uplinks.length - 1].timestamp;
    
    // Calculate uplink continuity
    const connectivityStatus = calculateUplinkContinuity(lastSeen);
    
    deviceHealth.push({
      devEui,
      avgScore: Math.round(avgScore * 100) / 100, // Round to 2 decimal places
      rfStatus,
      connectivityStatus,
      lastSeen
    });
  }
  
  res.json(deviceHealth);
});

// Get specific device endpoint
app.get('/api/devices/:devEui', (req, res) => {
  const devEui = req.params.devEui;
  const uplinks = deviceUplinksHistory[devEui];
  
  // Return 404 if device not found or no uplinks
  if (!uplinks || uplinks.length === 0) {
    return res.status(404).json({ error: 'Device not found or no uplinks received' });
  }
  
  // Get last 20 uplinks
  const lastUplinks = uplinks.slice(-20);
  
  // Calculate avgScore (average rfScore of last 20 uplinks)
  const sum = lastUplinks.reduce((acc, uplink) => acc + uplink.rfScore, 0);
  const avgScore = Math.round((sum / lastUplinks.length) * 100) / 100;
  
  // Determine rfStatus based on avgScore
  let rfStatus;
  if (avgScore >= 80) {
    rfStatus = 'HEALTHY';
  } else if (avgScore >= 50) {
    rfStatus = 'DEGRADED';
  } else {
    rfStatus = 'CRITICAL';
  }
  
  // Get lastSeen from most recent uplink
  const lastSeen = uplinks[uplinks.length - 1].timestamp;
  
  // Calculate uplink continuity
  const connectivityStatus = calculateUplinkContinuity(lastSeen);
  
  res.json({
    devEui,
    avgScore,
    rfStatus,
    connectivityStatus,
    lastSeen,
    uplinks: lastUplinks
  });
});

// Get best gateways analytics endpoint
app.get('/api/analytics/best-gateways', (req, res) => {
  const analytics = {
    suboptimalPlacements: [],
    gatewayStats: {}
  };
  
  // Collect all uplinks with their best status
  const allUplinks = [];
  for (const gatewayId in gatewayUplinks) {
    const uplinks = gatewayUplinks[gatewayId];
    uplinks.forEach(uplink => {
      allUplinks.push({
        ...uplink,
        gatewayId
      });
    });
  }
  
  // Group by devEui and timestamp window to find suboptimal placements
  const uplinkGroups = {};
  allUplinks.forEach(uplink => {
    const timestampMs = new Date(uplink.timestamp).getTime();
    const windowKey = `${uplink.devEui}_${Math.floor(timestampMs / UPLINK_COMPARISON_WINDOW_MS)}`;
    
    if (!uplinkGroups[windowKey]) {
      uplinkGroups[windowKey] = [];
    }
    uplinkGroups[windowKey].push(uplink);
  });
  
  // Find suboptimal placements (device used non-best gateway)
  for (const windowKey in uplinkGroups) {
    const group = uplinkGroups[windowKey];
    if (group.length > 1) {
      // Multiple gateways received this uplink
      const bestUplink = group.find(u => u.isBest);
      const nonBestUplinks = group.filter(u => !u.isBest);
      
      if (bestUplink && nonBestUplinks.length > 0) {
        nonBestUplinks.forEach(uplink => {
          analytics.suboptimalPlacements.push({
            devEui: uplink.devEui,
            timestamp: uplink.timestamp,
            usedGateway: uplink.gatewayId,
            usedRfScore: uplink.rfScore,
            bestGateway: bestUplink.gatewayId,
            bestRfScore: bestUplink.rfScore,
            scoreDifference: bestUplink.rfScore - uplink.rfScore
          });
        });
      }
    }
  }
  
  // Calculate gateway statistics
  for (const gatewayId in gatewayUplinks) {
    const uplinks = gatewayUplinks[gatewayId];
    const totalUplinks = uplinks.length;
    const bestUplinks = uplinks.filter(u => u.isBest).length;
    const suboptimalUplinks = uplinks.filter(u => !u.isBest && totalUplinks > 0).length;
    
    analytics.gatewayStats[gatewayId] = {
      totalUplinks,
      bestUplinks,
      suboptimalUplinks,
      bestGatewayRate: totalUplinks > 0 ? Math.round((bestUplinks / totalUplinks) * 100) / 100 : 0
    };
  }
  
  res.json(analytics);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
