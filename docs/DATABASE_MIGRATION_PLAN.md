# Database Migration Plan

## Overview

This document outlines the plan to migrate the RF Analytics Platform from in-memory storage to persistent database storage using PostgreSQL (or SQLite as fallback).

## Current State

- **Storage**: In-memory JavaScript objects
- **Data Loss**: All data lost on server restart
- **Scalability**: Limited by available RAM
- **Persistence**: None

## Target State

- **Storage**: PostgreSQL database (or SQLite)
- **Data Loss**: Zero (persistent storage)
- **Scalability**: Handles millions of records
- **Persistence**: Full historical data retention

---

## Architecture Summary

### Data Flow

```
ChirpStack → Backend API → PostgreSQL → Backend API → Frontend
```

**Key Points:**
1. ChirpStack sends uplinks to `POST /` endpoint
2. Backend processes and stores in database
3. Frontend queries backend REST API
4. Backend queries database and returns JSON
5. **No direct ChirpStack access from frontend**

### Database Schema

**3 Core Tables:**

1. **`gateways`** - Gateway metadata
   - `gateway_id` (PK)
   - `first_seen`, `last_seen`
   - Auto-updated via triggers

2. **`devices`** - Device metadata
   - `dev_eui` (PK)
   - `first_seen`, `last_seen`
   - Auto-updated via triggers

3. **`uplinks`** - All uplink events
   - `id` (PK, auto-increment)
   - `dev_eui` (FK → devices)
   - `gateway_id` (FK → gateways)
   - `timestamp`, `rssi`, `snr`
   - `rf_score` (computed)
   - `is_best` (boolean flag)

**Indexes:**
- Device history queries: `(dev_eui, timestamp DESC)`
- Gateway history queries: `(gateway_id, timestamp DESC)`
- Recent uplinks: `(timestamp DESC)`
- Best gateway analytics: `(is_best)` partial index

---

## Implementation Steps

### Phase 1: Database Setup (1-2 hours)

1. **Install PostgreSQL**
   ```bash
   sudo apt install postgresql postgresql-contrib
   ```

2. **Create Database**
   ```bash
   createdb rf_analytics
   psql rf_analytics < database/schema.sql
   ```

3. **Configure Environment**
   - Add `.env` file with database credentials
   - Test connection

### Phase 2: Backend Refactoring (4-6 hours)

1. **Install Dependencies**
   ```bash
   npm install pg dotenv
   # or for SQLite: npm install sqlite3 dotenv
   ```

2. **Create Database Service Layer**
   - `database/connection.js` - Connection pool setup
   - `database/gateways.js` - Gateway CRUD operations
   - `database/devices.js` - Device CRUD operations
   - `database/uplinks.js` - Uplink CRUD operations

3. **Refactor `POST /` Endpoint**
   - Replace in-memory storage with database inserts
   - Implement transaction handling
   - Update `isBest` logic to query database

4. **Refactor GET Endpoints**
   - `GET /api/last-uplink` - Query database
   - `GET /api/gateways/health` - Aggregate query
   - `GET /api/gateways/:gatewayId` - Join query
   - `GET /api/devices/health` - Aggregate query
   - `GET /api/devices/:devEui` - Join query

### Phase 3: Testing (2-3 hours)

1. **Unit Tests**
   - Test database connection
   - Test CRUD operations
   - Test transaction rollback

2. **Integration Tests**
   - Test `POST /` with sample ChirpStack payloads
   - Test all GET endpoints
   - Verify data consistency

3. **Performance Tests**
   - Test with 1000+ uplinks
   - Measure query latency
   - Verify index usage

### Phase 4: Deployment (1-2 hours)

1. **Backup Current System**
   - Export any existing in-memory data (if needed)
   - Document current state

2. **Deploy Database**
   - Run schema migration
   - Verify tables and indexes

3. **Deploy Backend**
   - Update environment variables
   - Restart backend service
   - Monitor logs

4. **Verify**
   - Send test uplink from ChirpStack
   - Verify data in database
   - Test frontend displays correctly

---

## API Compatibility

**All existing API endpoints remain unchanged:**

- ✅ `GET /health` - No changes
- ✅ `GET /api/last-uplink` - Same response format
- ✅ `GET /api/gateways/health` - Same response format
- ✅ `GET /api/gateways/:gatewayId` - Same response format
- ✅ `GET /api/devices/health` - Same response format
- ✅ `GET /api/devices/:devEui` - Same response format
- ✅ `POST /` - Same request format

**Frontend requires zero changes.**

---

## Database Queries (Examples)

### Insert Uplink
```sql
INSERT INTO uplinks (dev_eui, gateway_id, timestamp, rssi, snr, rf_score, is_best)
VALUES ($1, $2, $3, $4, $5, $6, $7);
```

### Get Gateway Health
```sql
SELECT 
    gateway_id,
    ROUND(AVG(rf_score)::numeric, 2) as avg_score,
    CASE 
        WHEN AVG(rf_score) >= 80 THEN 'HEALTHY'
        WHEN AVG(rf_score) >= 50 THEN 'DEGRADED'
        ELSE 'CRITICAL'
    END as status,
    MAX(timestamp) as last_seen
FROM uplinks
WHERE gateway_id = $1
  AND timestamp >= NOW() - INTERVAL '1 hour'
GROUP BY gateway_id;
```

### Get Device Last 20 Uplinks
```sql
SELECT timestamp, gateway_id, rssi, snr, rf_score
FROM uplinks
WHERE dev_eui = $1
ORDER BY timestamp DESC
LIMIT 20;
```

---

## Performance Considerations

### Indexes
- All foreign keys indexed
- Timestamp columns indexed for time-range queries
- Composite indexes for common query patterns

### Query Optimization
- Use `LIMIT` for pagination
- Filter by time ranges (last hour/day)
- Use `EXPLAIN ANALYZE` to optimize slow queries

### Connection Pooling
- Use `pg-pool` with 10 connections
- Prevents connection exhaustion
- Handles concurrent requests efficiently

### Future Optimizations
- **Partitioning**: Partition `uplinks` by month when table exceeds 10M rows
- **Caching**: Add Redis cache for frequently accessed health metrics
- **Read Replicas**: For high-read scenarios

---

## Rollback Plan

If issues occur during migration:

1. **Immediate Rollback**
   - Revert backend code to in-memory version
   - Restart backend service
   - System returns to previous state

2. **Data Preservation**
   - Database data remains intact
   - Can be migrated later
   - No data loss

3. **Gradual Migration**
   - Run both systems in parallel
   - Compare outputs
   - Switch when confident

---

## Monitoring

### Key Metrics

1. **Database Metrics**
   - Connection pool usage
   - Query latency (p50, p95, p99)
   - Table sizes
   - Index usage

2. **Application Metrics**
   - Uplink ingestion rate
   - API endpoint response times
   - Error rates
   - Transaction success rate

3. **Alerts**
   - Database connection failures
   - Slow queries (>100ms)
   - High error rates
   - Disk space warnings

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Database Setup | 1-2 hours | PostgreSQL installed |
| Backend Refactoring | 4-6 hours | Database setup complete |
| Testing | 2-3 hours | Backend refactoring complete |
| Deployment | 1-2 hours | Testing passed |
| **Total** | **8-13 hours** | |

---

## Success Criteria

✅ All uplinks stored in database  
✅ All API endpoints return correct data  
✅ Frontend displays data correctly  
✅ No data loss on server restart  
✅ Query latency < 100ms for health endpoints  
✅ System handles 100+ uplinks/second  

---

## Next Steps

1. Review and approve architecture design
2. Set up development database
3. Begin Phase 1 implementation
4. Test with sample data
5. Deploy to production

---

## Questions & Considerations

### Data Retention
- **Recommendation**: Keep all data indefinitely
- **Alternative**: Implement time-based retention (e.g., 90 days)
- **Decision**: Start with unlimited, add retention later if needed

### Backup Strategy
- **Daily backups**: Automated PostgreSQL dumps
- **Retention**: 30 days
- **Testing**: Monthly restore tests

### Scaling
- Current design handles 1000+ devices, 10+ gateways
- For larger scale: Consider partitioning, read replicas
- Monitor table sizes and query performance

---

## References

- [Architecture Design](./ARCHITECTURE.md) - Detailed architecture
- [Database Schema](../database/schema.sql) - PostgreSQL schema
- [Database Setup](../database/README.md) - Setup instructions
