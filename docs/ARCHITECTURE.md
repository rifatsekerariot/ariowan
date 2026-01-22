# RF Analytics Platform - Architecture Design

## High-Level Data Flow

```
┌─────────────┐
│ ChirpStack  │
│   Server    │
└──────┬──────┘
       │ HTTP POST /?event=up
       │ (Uplink payload)
       ▼
┌─────────────────────────────────┐
│      Backend API Server         │
│  (Express.js on port 8090)      │
│                                 │
│  POST / → Process uplink        │
│  - Extract devEui, gatewayId   │
│  - Calculate rfScore            │
│  - Determine isBest            │
│  - Store in database            │
└──────┬──────────────────────────┘
       │
       │ INSERT/UPDATE
       ▼
┌─────────────────────────────────┐
│      PostgreSQL Database         │
│  - gateways                     │
│  - devices                      │
│  - uplinks                      │
└─────────────────────────────────┘
       ▲
       │ SELECT queries
       │
┌──────┴──────────────────────────┐
│      Backend API Server         │
│                                 │
│  GET /api/gateways/health       │
│  GET /api/gateways/:gatewayId   │
│  GET /api/devices/health        │
│  GET /api/devices/:devEui       │
│  GET /api/last-uplink           │
└──────┬──────────────────────────┘
       │ JSON responses
       ▼
┌─────────────────────────────────┐
│      Frontend (React)           │
│  - Gateway Overview             │
│  - Device Overview              │
│  - Detail Pages                 │
│  - Charts & Analytics           │
└─────────────────────────────────┘
```

### Key Principles

1. **Single Source of Truth**: All data flows through the database
2. **No Direct ChirpStack Access**: Frontend never queries ChirpStack directly
3. **RESTful API**: Clean separation between frontend and backend
4. **Real-time Updates**: Backend processes uplinks immediately upon receipt
5. **Computed Metrics**: rfScore, isBest, status calculated at ingestion time

---

## Database Schema

### Table: `gateways`

Stores gateway metadata and first-seen timestamp.

```sql
CREATE TABLE gateways (
    gateway_id VARCHAR(255) PRIMARY KEY,
    first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_gateways_last_seen ON gateways(last_seen);
```

**Fields:**
- `gateway_id`: Unique identifier from ChirpStack (e.g., "eui-1234567890abcdef")
- `first_seen`: First time this gateway was seen
- `last_seen`: Most recent uplink timestamp (updated on each uplink)
- `created_at`: Record creation timestamp
- `updated_at`: Last update timestamp

---

### Table: `devices`

Stores device metadata and first-seen timestamp.

```sql
CREATE TABLE devices (
    dev_eui VARCHAR(255) PRIMARY KEY,
    first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_devices_last_seen ON devices(last_seen);
```

**Fields:**
- `dev_eui`: Unique device identifier (e.g., "0004a30b001e8a9b")
- `first_seen`: First time this device was seen
- `last_seen`: Most recent uplink timestamp (updated on each uplink)
- `created_at`: Record creation timestamp
- `updated_at`: Last update timestamp

---

### Table: `uplinks`

Stores all uplink events with computed metrics. This is the core table for analytics.

```sql
CREATE TABLE uplinks (
    id BIGSERIAL PRIMARY KEY,
    dev_eui VARCHAR(255) NOT NULL,
    gateway_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    rssi DECIMAL(5,2) NOT NULL,
    snr DECIMAL(5,2) NOT NULL,
    rf_score INTEGER NOT NULL,
    is_best BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (dev_eui) REFERENCES devices(dev_eui) ON DELETE CASCADE,
    FOREIGN KEY (gateway_id) REFERENCES gateways(gateway_id) ON DELETE CASCADE
);

-- Indexes for common query patterns
CREATE INDEX idx_uplinks_dev_eui_timestamp ON uplinks(dev_eui, timestamp DESC);
CREATE INDEX idx_uplinks_gateway_id_timestamp ON uplinks(gateway_id, timestamp DESC);
CREATE INDEX idx_uplinks_timestamp ON uplinks(timestamp DESC);
CREATE INDEX idx_uplinks_is_best ON uplinks(is_best) WHERE is_best = TRUE;
CREATE INDEX idx_uplinks_dev_eui_gateway_timestamp ON uplinks(dev_eui, gateway_id, timestamp DESC);
```

**Fields:**
- `id`: Auto-incrementing primary key
- `dev_eui`: Foreign key to devices table
- `gateway_id`: Foreign key to gateways table
- `timestamp`: ISO timestamp from ChirpStack (or server time if missing)
- `rssi`: Received Signal Strength Indicator (dBm)
- `snr`: Signal-to-Noise Ratio (dB)
- `rf_score`: Computed score (100, 70, or 40) based on SNR and RSSI rules
- `is_best`: Boolean flag indicating if this gateway had the best rfScore within the 5-second comparison window
- `created_at`: Record insertion timestamp

**Indexes:**
- `idx_uplinks_dev_eui_timestamp`: Fast queries for device history (last N uplinks)
- `idx_uplinks_gateway_id_timestamp`: Fast queries for gateway history
- `idx_uplinks_timestamp`: Fast queries for most recent uplinks across all devices/gateways
- `idx_uplinks_is_best`: Fast queries for best gateway analytics
- `idx_uplinks_dev_eui_gateway_timestamp`: Fast queries for device-gateway relationship analysis

---

## Data Retention Strategy

### Option 1: Unlimited Storage (Recommended for Production)
- Keep all uplinks indefinitely
- Use partitioning by month/year for large datasets
- Enables historical analysis and trend detection

### Option 2: Time-Based Retention
```sql
-- Delete uplinks older than 90 days (example)
DELETE FROM uplinks 
WHERE timestamp < NOW() - INTERVAL '90 days';
```

### Option 3: Count-Based Retention (Per Device/Gateway)
- Keep last N uplinks per device/gateway
- Requires periodic cleanup job
- More complex but limits storage growth

**Recommendation**: Start with Option 1, implement partitioning when table size exceeds 10M rows.

---

## API Endpoints (Unchanged Interface)

The REST API interface remains the same for frontend compatibility:

### `GET /api/last-uplink`
Returns the most recent uplink across all gateways.

**Query:**
```sql
SELECT u.*, d.dev_eui, g.gateway_id
FROM uplinks u
JOIN devices d ON u.dev_eui = d.dev_eui
JOIN gateways g ON u.gateway_id = g.gateway_id
ORDER BY u.timestamp DESC
LIMIT 1;
```

### `GET /api/gateways/health`
Returns health metrics for all gateways.

**Query:**
```sql
SELECT 
    g.gateway_id,
    ROUND(AVG(u.rf_score)::numeric, 2) as avg_score,
    CASE 
        WHEN AVG(u.rf_score) >= 80 THEN 'HEALTHY'
        WHEN AVG(u.rf_score) >= 50 THEN 'DEGRADED'
        ELSE 'CRITICAL'
    END as status,
    MAX(u.timestamp) as last_seen,
    CASE 
        WHEN STDDEV(u.snr) <= 2 THEN 'STABLE'
        WHEN STDDEV(u.snr) <= 5 THEN 'UNSTABLE'
        ELSE 'VERY_UNSTABLE'
    END as stability_index
FROM gateways g
LEFT JOIN uplinks u ON g.gateway_id = u.gateway_id
WHERE u.timestamp >= NOW() - INTERVAL '1 hour'  -- Last hour of data
GROUP BY g.gateway_id
HAVING COUNT(u.id) > 0
ORDER BY g.gateway_id;
```

### `GET /api/gateways/:gatewayId`
Returns detailed information for a specific gateway.

**Query:**
```sql
-- Get gateway metadata
SELECT * FROM gateways WHERE gateway_id = $1;

-- Get last 20 uplinks
SELECT 
    timestamp,
    dev_eui,
    rssi,
    snr,
    rf_score
FROM uplinks
WHERE gateway_id = $1
ORDER BY timestamp DESC
LIMIT 20;
```

### `GET /api/devices/health`
Returns health metrics for all devices.

**Query:**
```sql
SELECT 
    d.dev_eui,
    ROUND(AVG(u.rf_score)::numeric, 2) as avg_score,
    CASE 
        WHEN AVG(u.rf_score) >= 80 THEN 'HEALTHY'
        WHEN AVG(u.rf_score) >= 50 THEN 'DEGRADED'
        ELSE 'CRITICAL'
    END as rf_status,
    CASE 
        WHEN MAX(u.timestamp) < NOW() - INTERVAL '75 minutes' THEN 'OFFLINE'
        WHEN MAX(u.timestamp) IS NULL THEN 'UNKNOWN'
        ELSE 'ONLINE'
    END as connectivity_status,
    MAX(u.timestamp) as last_seen
FROM devices d
LEFT JOIN uplinks u ON d.dev_eui = u.dev_eui
WHERE u.timestamp >= NOW() - INTERVAL '1 hour'  -- Last hour of data
GROUP BY d.dev_eui
HAVING COUNT(u.id) > 0
ORDER BY d.dev_eui;
```

### `GET /api/devices/:devEui`
Returns detailed information for a specific device.

**Query:**
```sql
-- Get device metadata
SELECT * FROM devices WHERE dev_eui = $1;

-- Get last 20 uplinks
SELECT 
    timestamp,
    gateway_id,
    rssi,
    snr,
    rf_score
FROM uplinks
WHERE dev_eui = $1
ORDER BY timestamp DESC
LIMIT 20;
```

---

## Backend Processing Logic

### Uplink Ingestion Flow (POST /)

1. **Receive uplink from ChirpStack**
   - Parse `event` query parameter
   - Extract `deviceInfo.devEui`
   - Extract `rxInfo[]` array

2. **For each rxInfo item:**
   - Extract: `gatewayId`, `rssi`, `snr`, `time`
   - Calculate `rfScore` using rules:
     - `snr >= 7 && rssi >= -90` → 100
     - `snr >= 3 && rssi >= -105` → 70
     - else → 40

3. **Determine `isBest` flag:**
   - Query database for all uplinks from same `devEui` within 5-second window
   - Compare `rfScore` values
   - Mark highest `rfScore` as `isBest = TRUE`
   - Update previous `isBest` flags if needed

4. **Database operations (transaction):**
   ```sql
   BEGIN;
   
   -- Upsert gateway
   INSERT INTO gateways (gateway_id, first_seen, last_seen)
   VALUES ($1, CURRENT_TIMESTAMP, $2)
   ON CONFLICT (gateway_id) 
   DO UPDATE SET last_seen = $2, updated_at = CURRENT_TIMESTAMP;
   
   -- Upsert device
   INSERT INTO devices (dev_eui, first_seen, last_seen)
   VALUES ($3, CURRENT_TIMESTAMP, $2)
   ON CONFLICT (dev_eui) 
   DO UPDATE SET last_seen = $2, updated_at = CURRENT_TIMESTAMP;
   
   -- Insert uplink
   INSERT INTO uplinks (dev_eui, gateway_id, timestamp, rssi, snr, rf_score, is_best)
   VALUES ($3, $1, $2, $4, $5, $6, $7);
   
   -- Update isBest flags for competing uplinks in same window
   UPDATE uplinks
   SET is_best = FALSE
   WHERE dev_eui = $3
     AND gateway_id != $1
     AND timestamp >= $2 - INTERVAL '5 seconds'
     AND timestamp <= $2 + INTERVAL '5 seconds';
   
   COMMIT;
   ```

---

## Technology Stack

### Database
- **Primary**: PostgreSQL 14+ (recommended for production)
- **Fallback**: SQLite (for development/testing)

### Backend
- **ORM/Query Builder**: 
  - Option 1: `pg` (native PostgreSQL driver) + raw SQL
  - Option 2: `knex.js` (query builder with migrations)
  - Option 3: `sequelize` (full ORM)
  
**Recommendation**: Start with `pg` for simplicity, migrate to `knex.js` if migrations become complex.

### Connection Pooling
- Use `pg-pool` for connection pooling
- Default pool size: 10 connections
- Configure via environment variables

---

## Environment Variables

```bash
# Database Configuration
DB_TYPE=postgresql  # or 'sqlite'
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rf_analytics
DB_USER=rf_user
DB_PASSWORD=secure_password

# For SQLite (fallback)
DB_PATH=./data/rf_analytics.db

# Connection Pool
DB_POOL_MIN=2
DB_POOL_MAX=10

# Server
PORT=8090
```

---

## Migration Path

### Phase 1: Database Setup
1. Create database schema
2. Set up connection pooling
3. Create database service layer

### Phase 2: Refactor Backend
1. Replace in-memory storage with database calls
2. Implement transaction handling
3. Add error handling and logging

### Phase 3: Testing
1. Test with sample ChirpStack payloads
2. Verify all API endpoints
3. Performance testing with large datasets

### Phase 4: Deployment
1. Backup existing in-memory data (if any)
2. Deploy database migration
3. Deploy updated backend
4. Monitor for issues

---

## Performance Considerations

### Query Optimization
- Use indexes for common query patterns
- Limit result sets (e.g., last 20 uplinks)
- Use `EXPLAIN ANALYZE` to optimize slow queries

### Caching (Optional)
- Cache gateway/device health metrics for 5-10 seconds
- Use Redis for high-traffic scenarios
- Not required for initial implementation

### Partitioning (Future)
- Partition `uplinks` table by month for large datasets
- Enables faster queries on recent data
- Implement when table exceeds 10M rows

---

## Backup Strategy

### Automated Backups
- Daily full database backups
- Retain backups for 30 days
- Test restore procedures monthly

### Point-in-Time Recovery
- Enable WAL (Write-Ahead Logging) in PostgreSQL
- Allows recovery to any point in time

---

## Security Considerations

1. **Database Access**: Use least-privilege user accounts
2. **Connection Security**: Use SSL/TLS for database connections
3. **SQL Injection**: Use parameterized queries (pg library handles this)
4. **Rate Limiting**: Implement rate limiting on POST / endpoint
5. **Input Validation**: Validate ChirpStack payload structure

---

## Monitoring & Observability

### Metrics to Track
- Uplink ingestion rate (uplinks/second)
- Database query latency (p50, p95, p99)
- Database connection pool usage
- API endpoint response times
- Error rates

### Logging
- Log all uplink ingestions (devEui, gatewayId, timestamp)
- Log database errors
- Log slow queries (>100ms)

---

## Summary

This architecture provides:
- ✅ Persistent storage for all gateway and device metrics
- ✅ Clean REST API for frontend
- ✅ No direct ChirpStack access from frontend
- ✅ Scalable design with proper indexing
- ✅ Transaction safety for data consistency
- ✅ Clear migration path from in-memory storage
