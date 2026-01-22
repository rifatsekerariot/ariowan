# System Verification Guide

This guide provides step-by-step instructions to verify the RF Analytics Platform is working end-to-end.

## Prerequisites

- Docker and Docker Compose installed
- System running: `docker compose up -d`
- All services healthy: `docker compose ps`

## Step 1: Health Check Verification

### Backend Health Check

```bash
# Check backend health endpoint
curl http://localhost:8090/health

# Expected response:
# {"status":"ok"}
```

### Database Health Check

```bash
# Check if PostgreSQL is accepting connections
docker compose exec postgres pg_isready -U rf_user

# Expected output:
# postgres:5432 - accepting connections
```

### All Services Status

```bash
# Check all services are running
docker compose ps

# Expected output shows all services as "Up" and "healthy"
```

## Step 2: Database Schema Verification

### Verify Tables Exist

```bash
# Connect to PostgreSQL
docker compose exec postgres psql -U rf_user -d rf_analytics

# Run SQL query
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('gateways', 'devices', 'uplinks')
ORDER BY table_name;

# Expected output:
#  table_name
# ------------
#  devices
#  gateways
#  uplinks
```

### Verify Indexes Exist

```sql
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('gateways', 'devices', 'uplinks')
ORDER BY tablename, indexname;
```

### Verify Triggers Exist

```sql
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE event_object_schema = 'public'
ORDER BY event_object_table;
```

## Step 3: ChirpStack Webhook Test

### Sample ChirpStack Uplink Payload

Create a test file `test-uplink.json`:

```json
{
  "deviceInfo": {
    "devEui": "0004a30b001e8a9b",
    "deviceName": "Test Device",
    "applicationId": "12345678-1234-1234-1234-123456789012",
    "applicationName": "Test Application"
  },
  "rxInfo": [
    {
      "gatewayId": "eui-1234567890abcdef",
      "rssi": -85,
      "snr": 8.5,
      "time": "2024-01-15T10:30:00.000Z",
      "location": {
        "latitude": 40.7128,
        "longitude": -74.0060
      }
    },
    {
      "gatewayId": "eui-abcdef1234567890",
      "rssi": -92,
      "snr": 6.2,
      "time": "2024-01-15T10:30:00.100Z"
    }
  ],
  "txInfo": {
    "frequency": 868100000,
    "dataRate": {
      "modulation": "LORA",
      "bandwidth": 125,
      "spreadFactor": 7
    }
  },
  "adr": true,
  "fCnt": 1234,
  "fPort": 1
}
```

### Send Test Uplink via curl

```bash
# Send uplink event
curl -X POST "http://localhost:8090/?event=up" \
  -H "Content-Type: application/json" \
  -d @test-uplink.json

# Expected response:
# HTTP 200 OK (empty body)
```

### Verify Rate Limiting

```bash
# Send multiple requests quickly to test rate limiting
for i in {1..105}; do
  curl -X POST "http://localhost:8090/?event=up" \
    -H "Content-Type: application/json" \
    -d @test-uplink.json \
    -w "\nStatus: %{http_code}\n"
done

# Expected: First 100 requests return 200, 101st+ return 429
```

## Step 4: Database Verification

### Check Gateway Insert

```bash
docker compose exec postgres psql -U rf_user -d rf_analytics -c "
SELECT 
  gateway_id,
  first_seen,
  last_seen,
  created_at
FROM gateways
ORDER BY created_at DESC
LIMIT 5;
"
```

### Check Device Insert

```bash
docker compose exec postgres psql -U rf_user -d rf_analytics -c "
SELECT 
  dev_eui,
  first_seen,
  last_seen,
  created_at
FROM devices
ORDER BY created_at DESC
LIMIT 5;
"
```

### Check Uplink Insert

```bash
docker compose exec postgres psql -U rf_user -d rf_analytics -c "
SELECT 
  id,
  dev_eui,
  gateway_id,
  timestamp,
  rssi,
  snr,
  rf_score,
  is_best,
  created_at
FROM uplinks
ORDER BY created_at DESC
LIMIT 10;
"
```

### Verify RF Score Calculation

```bash
docker compose exec postgres psql -U rf_user -d rf_analytics -c "
SELECT 
  rssi,
  snr,
  rf_score,
  (snr * 2) + (rssi / 10) as calculated_score
FROM uplinks
ORDER BY created_at DESC
LIMIT 5;
"
```

### Verify Trigger Updates (last_seen)

```bash
# Send another uplink
curl -X POST "http://localhost:8090/?event=up" \
  -H "Content-Type: application/json" \
  -d @test-uplink.json

# Check if last_seen was updated
docker compose exec postgres psql -U rf_user -d rf_analytics -c "
SELECT 
  gateway_id,
  last_seen,
  updated_at
FROM gateways
WHERE gateway_id = 'eui-1234567890abcdef';
"
```

## Step 5: API Endpoint Verification

### Get Last Uplink

```bash
curl http://localhost:8090/api/last-uplink

# Expected response (if data exists):
# {
#   "timestamp": "2024-01-15T10:30:00.000Z",
#   "dev_eui": "0004a30b001e8a9b",
#   "gateway_id": "eui-1234567890abcdef",
#   "rssi": -85,
#   "snr": 8.5,
#   "rf_score": 2
# }
```

### Get All Gateways

```bash
curl http://localhost:8090/api/gateways

# Expected response:
# [
#   {
#     "gatewayId": "eui-1234567890abcdef",
#     "firstSeen": "2024-01-15T10:30:00.000Z",
#     "lastSeen": "2024-01-15T10:30:00.000Z",
#     ...
#   }
# ]
```

### Get Gateway Health

```bash
curl http://localhost:8090/api/gateways/health

# Expected response:
# [
#   {
#     "gatewayId": "eui-1234567890abcdef",
#     "avgScore": 2.0,
#     "status": "CRITICAL",
#     "lastSeen": "2024-01-15T10:30:00.000Z",
#     "stabilityIndex": "STABLE"
#   }
# ]
```

### Get Gateway Metrics

```bash
curl "http://localhost:8090/api/gateways/eui-1234567890abcdef/metrics"

# With time range:
curl "http://localhost:8090/api/gateways/eui-1234567890abcdef/metrics?from=2024-01-15T00:00:00Z&to=2024-01-15T23:59:59Z"
```

### Get All Devices

```bash
curl http://localhost:8090/api/devices
```

### Get Device Health

```bash
curl http://localhost:8090/api/devices/health
```

### Get Device Metrics

```bash
curl "http://localhost:8090/api/devices/0004a30b001e8a9b/metrics"
```

## Step 6: End-to-End Verification Script

Create `scripts/verify.sh`:

```bash
#!/bin/bash

set -e

echo "=== RF Analytics Platform Verification ==="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check services
echo "1. Checking services..."
if docker compose ps | grep -q "Up.*healthy"; then
  echo -e "${GREEN}✓ Services are running${NC}"
else
  echo -e "${RED}✗ Services are not healthy${NC}"
  exit 1
fi

# Check backend health
echo "2. Checking backend health..."
if curl -sf http://localhost:8090/health > /dev/null; then
  echo -e "${GREEN}✓ Backend is healthy${NC}"
else
  echo -e "${RED}✗ Backend health check failed${NC}"
  exit 1
fi

# Check database
echo "3. Checking database..."
if docker compose exec -T postgres pg_isready -U rf_user > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Database is ready${NC}"
else
  echo -e "${RED}✗ Database is not ready${NC}"
  exit 1
fi

# Send test uplink
echo "4. Sending test uplink..."
if [ -f "test-uplink.json" ]; then
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://localhost:8090/?event=up" \
    -H "Content-Type: application/json" \
    -d @test-uplink.json)
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Uplink sent successfully${NC}"
  else
    echo -e "${RED}✗ Uplink failed with HTTP $HTTP_CODE${NC}"
    exit 1
  fi
else
  echo -e "${RED}✗ test-uplink.json not found${NC}"
  exit 1
fi

# Wait for processing
echo "5. Waiting for data processing..."
sleep 2

# Verify data in database
echo "6. Verifying data in database..."
UPLINK_COUNT=$(docker compose exec -T postgres psql -U rf_user -d rf_analytics -t -c "SELECT COUNT(*) FROM uplinks;")
if [ "$UPLINK_COUNT" -gt 0 ]; then
  echo -e "${GREEN}✓ Found $UPLINK_COUNT uplink(s) in database${NC}"
else
  echo -e "${RED}✗ No uplinks found in database${NC}"
  exit 1
fi

# Check API endpoints
echo "7. Checking API endpoints..."
if curl -sf http://localhost:8090/api/gateways > /dev/null; then
  echo -e "${GREEN}✓ API endpoints are working${NC}"
else
  echo -e "${RED}✗ API endpoints failed${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}=== All verification steps passed! ===${NC}"
```

Make it executable:
```bash
chmod +x scripts/verify.sh
```

## Step 7: Manual SQL Verification Queries

### Count Records

```sql
-- Count all records
SELECT 
  (SELECT COUNT(*) FROM gateways) as gateway_count,
  (SELECT COUNT(*) FROM devices) as device_count,
  (SELECT COUNT(*) FROM uplinks) as uplink_count;
```

### Recent Activity

```sql
-- Recent uplinks with details
SELECT 
  u.id,
  u.timestamp,
  d.dev_eui,
  g.gateway_id,
  u.rssi,
  u.snr,
  u.rf_score,
  u.is_best
FROM uplinks u
JOIN devices d ON u.dev_eui = d.dev_eui
JOIN gateways g ON u.gateway_id = g.gateway_id
ORDER BY u.timestamp DESC
LIMIT 20;
```

### Gateway Statistics

```sql
-- Gateway statistics
SELECT 
  g.gateway_id,
  COUNT(u.id) as total_uplinks,
  AVG(u.rf_score) as avg_rf_score,
  MIN(u.rssi) as min_rssi,
  MAX(u.rssi) as max_rssi,
  MIN(u.snr) as min_snr,
  MAX(u.snr) as max_snr,
  MAX(u.timestamp) as last_seen
FROM gateways g
LEFT JOIN uplinks u ON g.gateway_id = u.gateway_id
GROUP BY g.gateway_id
ORDER BY total_uplinks DESC;
```

### Device Statistics

```sql
-- Device statistics
SELECT 
  d.dev_eui,
  COUNT(u.id) as total_uplinks,
  COUNT(DISTINCT u.gateway_id) as gateway_count,
  AVG(u.rf_score) as avg_rf_score,
  MAX(u.timestamp) as last_seen
FROM devices d
LEFT JOIN uplinks u ON d.dev_eui = u.dev_eui
GROUP BY d.dev_eui
ORDER BY total_uplinks DESC;
```

### Verify RF Score Formula

```sql
-- Verify RF score matches formula: (snr * 2) + (rssi / 10)
SELECT 
  rssi,
  snr,
  rf_score,
  ROUND((snr * 2) + (rssi / 10)) as calculated_score,
  CASE 
    WHEN rf_score = ROUND((snr * 2) + (rssi / 10)) THEN 'MATCH'
    ELSE 'MISMATCH'
  END as verification
FROM uplinks
ORDER BY created_at DESC
LIMIT 10;
```

## Step 8: Log Verification

### Check Backend Logs

```bash
# View recent backend logs
docker compose logs --tail=50 backend

# Look for:
# - "Database connected successfully"
# - "Processing uplink"
# - "Uplink stored successfully"
```

### Check Database Logs

```bash
# View PostgreSQL logs
docker compose logs --tail=50 postgres
```

### Check for Errors

```bash
# Search for errors in all logs
docker compose logs | grep -i error

# Search for warnings
docker compose logs | grep -i warn
```

## Troubleshooting

### Backend Can't Connect to Database

```bash
# Check database is running
docker compose ps postgres

# Check network connectivity
docker compose exec backend ping postgres

# Verify environment variables
docker compose exec backend env | grep DB_
```

### No Data After Sending Uplink

```bash
# Check backend logs for errors
docker compose logs backend | tail -20

# Verify uplink was received
docker compose logs backend | grep "Processing uplink"

# Check database directly
docker compose exec postgres psql -U rf_user -d rf_analytics -c "SELECT COUNT(*) FROM uplinks;"
```

### API Returns Empty Results

```bash
# Check if data exists
docker compose exec postgres psql -U rf_user -d rf_analytics -c "SELECT COUNT(*) FROM uplinks;"

# Check time range (health endpoints filter by last hour)
docker compose exec postgres psql -U rf_user -d rf_analytics -c "
SELECT 
  MAX(timestamp) as last_uplink,
  NOW() - MAX(timestamp) as time_since_last
FROM uplinks;
"
```

## Quick Verification Checklist

- [ ] All Docker services are running and healthy
- [ ] Backend health endpoint returns `{"status":"ok"}`
- [ ] Database accepts connections
- [ ] Tables exist (gateways, devices, uplinks)
- [ ] Test uplink can be sent via curl
- [ ] Data appears in database after uplink
- [ ] RF scores are calculated correctly
- [ ] API endpoints return data
- [ ] Rate limiting works (429 after limit)
- [ ] Logs show no errors

## Expected Results Summary

After sending a test uplink, you should see:

1. **Database**: 
   - 1+ records in `gateways` table
   - 1+ records in `devices` table
   - 2+ records in `uplinks` table (one per rxInfo item)

2. **API**:
   - `GET /api/gateways` returns gateway list
   - `GET /api/gateways/health` returns health metrics
   - `GET /api/devices` returns device list
   - `GET /api/devices/health` returns health metrics

3. **Logs**:
   - No errors
   - "Processing uplink" messages
   - "Uplink stored successfully" messages
