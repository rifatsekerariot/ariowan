#!/bin/bash

# Quick database inspection script

echo "=== Database Statistics ==="
echo ""

docker compose exec -T postgres psql -U rf_user -d rf_analytics <<EOF

-- Count records
SELECT 
  'Gateways' as table_name,
  COUNT(*) as count
FROM gateways
UNION ALL
SELECT 
  'Devices' as table_name,
  COUNT(*) as count
FROM devices
UNION ALL
SELECT 
  'Uplinks' as table_name,
  COUNT(*) as count
FROM uplinks;

-- Recent uplinks
SELECT 
  '=== Recent Uplinks ===' as info;
  
SELECT 
  u.id,
  u.timestamp,
  LEFT(d.dev_eui, 12) || '...' as dev_eui,
  LEFT(g.gateway_id, 20) || '...' as gateway_id,
  u.rssi,
  u.snr,
  u.rf_score,
  u.is_best
FROM uplinks u
JOIN devices d ON u.dev_eui = d.dev_eui
JOIN gateways g ON u.gateway_id = g.gateway_id
ORDER BY u.timestamp DESC
LIMIT 10;

-- Gateway summary
SELECT 
  '=== Gateway Summary ===' as info;
  
SELECT 
  g.gateway_id,
  COUNT(u.id) as uplink_count,
  ROUND(AVG(u.rf_score)::numeric, 2) as avg_rf_score,
  MAX(u.timestamp) as last_seen
FROM gateways g
LEFT JOIN uplinks u ON g.gateway_id = u.gateway_id
GROUP BY g.gateway_id
ORDER BY uplink_count DESC;

-- Device summary
SELECT 
  '=== Device Summary ===' as info;
  
SELECT 
  d.dev_eui,
  COUNT(u.id) as uplink_count,
  COUNT(DISTINCT u.gateway_id) as gateway_count,
  ROUND(AVG(u.rf_score)::numeric, 2) as avg_rf_score,
  MAX(u.timestamp) as last_seen
FROM devices d
LEFT JOIN uplinks u ON d.dev_eui = u.dev_eui
GROUP BY d.dev_eui
ORDER BY uplink_count DESC;

EOF
