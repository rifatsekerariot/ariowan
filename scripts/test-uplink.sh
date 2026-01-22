#!/bin/bash

# Quick test script to send a ChirpStack uplink payload

PAYLOAD_FILE="${1:-test-uplink.json}"

if [ ! -f "$PAYLOAD_FILE" ]; then
  echo "Error: Payload file not found: $PAYLOAD_FILE"
  echo "Usage: $0 [payload-file.json]"
  exit 1
fi

echo "Sending uplink from $PAYLOAD_FILE..."
echo ""

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "http://localhost:8090/?event=up" \
  -H "Content-Type: application/json" \
  -d @"$PAYLOAD_FILE")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "✓ Uplink sent successfully (HTTP $HTTP_CODE)"
  echo ""
  echo "Verifying data in database..."
  sleep 1
  
  docker compose exec -T postgres psql -U rf_user -d rf_analytics -c "
    SELECT 
      'Uplinks: ' || COUNT(*) as count
    FROM uplinks
    WHERE created_at > NOW() - INTERVAL '1 minute';
  "
else
  echo "✗ Uplink failed (HTTP $HTTP_CODE)"
  echo "Response: $BODY"
  exit 1
fi
