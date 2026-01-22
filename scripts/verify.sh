#!/bin/bash

set -e

echo "=== RF Analytics Platform Verification ==="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check services
echo "1. Checking services..."
if docker compose ps 2>/dev/null | grep -q "Up.*healthy"; then
  echo -e "${GREEN}✓ Services are running${NC}"
else
  echo -e "${RED}✗ Services are not healthy${NC}"
  echo "   Run: docker compose ps"
  exit 1
fi

# Check backend health
echo "2. Checking backend health..."
if curl -sf http://localhost:8090/health > /dev/null 2>&1; then
  HEALTH_RESPONSE=$(curl -sf http://localhost:8090/health)
  if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
    echo -e "${GREEN}✓ Backend is healthy${NC}"
  else
    echo -e "${RED}✗ Backend health check returned unexpected response${NC}"
    exit 1
  fi
else
  echo -e "${RED}✗ Backend health check failed${NC}"
  echo "   Check: docker compose logs backend"
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

# Check tables exist
echo "4. Checking database schema..."
TABLE_COUNT=$(docker compose exec -T postgres psql -U rf_user -d rf_analytics -t -c "
  SELECT COUNT(*) 
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name IN ('gateways', 'devices', 'uplinks');
" | tr -d ' ')

if [ "$TABLE_COUNT" = "3" ]; then
  echo -e "${GREEN}✓ All required tables exist${NC}"
else
  echo -e "${RED}✗ Missing tables (found: $TABLE_COUNT/3)${NC}"
  exit 1
fi

# Send test uplink
echo "5. Sending test uplink..."
if [ -f "test-uplink.json" ]; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:8090/?event=up" \
    -H "Content-Type: application/json" \
    -d @test-uplink.json)
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Uplink sent successfully (HTTP $HTTP_CODE)${NC}"
  else
    echo -e "${RED}✗ Uplink failed with HTTP $HTTP_CODE${NC}"
    exit 1
  fi
else
  echo -e "${YELLOW}⚠ test-uplink.json not found, skipping uplink test${NC}"
fi

# Wait for processing
if [ -f "test-uplink.json" ]; then
  echo "6. Waiting for data processing..."
  sleep 2

  # Verify data in database
  echo "7. Verifying data in database..."
  UPLINK_COUNT=$(docker compose exec -T postgres psql -U rf_user -d rf_analytics -t -c "SELECT COUNT(*) FROM uplinks;" | tr -d ' ')
  GATEWAY_COUNT=$(docker compose exec -T postgres psql -U rf_user -d rf_analytics -t -c "SELECT COUNT(*) FROM gateways;" | tr -d ' ')
  DEVICE_COUNT=$(docker compose exec -T postgres psql -U rf_user -d rf_analytics -t -c "SELECT COUNT(*) FROM devices;" | tr -d ' ')

  if [ "$UPLINK_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Found $UPLINK_COUNT uplink(s) in database${NC}"
  else
    echo -e "${YELLOW}⚠ No uplinks found in database${NC}"
  fi

  if [ "$GATEWAY_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Found $GATEWAY_COUNT gateway(s) in database${NC}"
  else
    echo -e "${YELLOW}⚠ No gateways found in database${NC}"
  fi

  if [ "$DEVICE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Found $DEVICE_COUNT device(s) in database${NC}"
  else
    echo -e "${YELLOW}⚠ No devices found in database${NC}"
  fi
fi

# Check API endpoints
echo "8. Checking API endpoints..."
if curl -sf http://localhost:8090/api/gateways > /dev/null 2>&1; then
  echo -e "${GREEN}✓ GET /api/gateways is working${NC}"
else
  echo -e "${YELLOW}⚠ GET /api/gateways failed${NC}"
fi

if curl -sf http://localhost:8090/api/devices > /dev/null 2>&1; then
  echo -e "${GREEN}✓ GET /api/devices is working${NC}"
else
  echo -e "${YELLOW}⚠ GET /api/devices failed${NC}"
fi

if curl -sf http://localhost:8090/api/gateways/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ GET /api/gateways/health is working${NC}"
else
  echo -e "${YELLOW}⚠ GET /api/gateways/health failed${NC}"
fi

if curl -sf http://localhost:8090/api/devices/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ GET /api/devices/health is working${NC}"
else
  echo -e "${YELLOW}⚠ GET /api/devices/health failed${NC}"
fi

echo ""
echo -e "${GREEN}=== Verification complete! ===${NC}"
echo ""
echo "Next steps:"
echo "  - View logs: docker compose logs -f"
echo "  - Check data: docker compose exec postgres psql -U rf_user -d rf_analytics"
echo "  - Test API: curl http://localhost:8090/api/gateways"
