# Database Setup Guide

## PostgreSQL Setup (Recommended)

### 1. Install PostgreSQL

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

**macOS:**
```bash
brew install postgresql
brew services start postgresql
```

**Windows:**
Download from [PostgreSQL official website](https://www.postgresql.org/download/windows/)

### 2. Create Database and User

```bash
# Connect to PostgreSQL as superuser
sudo -u postgres psql

# Create database
CREATE DATABASE rf_analytics;

# Create user
CREATE USER rf_user WITH PASSWORD 'your_secure_password';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE rf_analytics TO rf_user;

# Connect to the database
\c rf_analytics

# Grant schema privileges
GRANT ALL ON SCHEMA public TO rf_user;

# Exit
\q
```

### 3. Run Schema Migration

```bash
# From project root
psql -U rf_user -d rf_analytics -f database/schema.sql
```

Or using connection string:
```bash
psql postgresql://rf_user:your_secure_password@localhost:5432/rf_analytics -f database/schema.sql
```

### 4. Verify Installation

```bash
psql -U rf_user -d rf_analytics -c "\dt"
```

Should show:
- `gateways`
- `devices`
- `uplinks`

---

## SQLite Setup (Fallback/Development)

### 1. Install SQLite

SQLite is usually pre-installed on most systems. Verify:
```bash
sqlite3 --version
```

### 2. Create Database

```bash
# Create database directory
mkdir -p data

# Create database file
sqlite3 data/rf_analytics.db < database/schema.sql
```

**Note:** SQLite doesn't support:
- `BIGSERIAL` (use `INTEGER PRIMARY KEY AUTOINCREMENT`)
- `DECIMAL` (use `REAL`)
- Triggers and functions (need manual updates)
- Some advanced PostgreSQL features

### 3. Modified Schema for SQLite

For SQLite, use this modified schema:

```sql
-- SQLite-compatible schema
CREATE TABLE IF NOT EXISTS gateways (
    gateway_id TEXT PRIMARY KEY,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devices (
    dev_eui TEXT PRIMARY KEY,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS uplinks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dev_eui TEXT NOT NULL,
    gateway_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    rssi REAL NOT NULL,
    snr REAL NOT NULL,
    rf_score INTEGER NOT NULL,
    is_best INTEGER NOT NULL DEFAULT 0,  -- SQLite uses INTEGER for boolean
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (dev_eui) REFERENCES devices(dev_eui) ON DELETE CASCADE,
    FOREIGN KEY (gateway_id) REFERENCES gateways(gateway_id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_uplinks_dev_eui_timestamp 
    ON uplinks(dev_eui, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_uplinks_gateway_id_timestamp 
    ON uplinks(gateway_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_uplinks_timestamp 
    ON uplinks(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_uplinks_is_best 
    ON uplinks(is_best) WHERE is_best = 1;
```

---

## Environment Variables

Create a `.env` file in the project root:

```bash
# Database Configuration
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rf_analytics
DB_USER=rf_user
DB_PASSWORD=your_secure_password

# For SQLite
# DB_TYPE=sqlite
# DB_PATH=./data/rf_analytics.db

# Server
PORT=8090
```

---

## Testing Database Connection

### PostgreSQL
```bash
psql -U rf_user -d rf_analytics -c "SELECT version();"
```

### SQLite
```bash
sqlite3 data/rf_analytics.db "SELECT sqlite_version();"
```

---

## Backup & Restore

### PostgreSQL Backup
```bash
# Full backup
pg_dump -U rf_user -d rf_analytics > backup_$(date +%Y%m%d).sql

# Restore
psql -U rf_user -d rf_analytics < backup_20240101.sql
```

### SQLite Backup
```bash
# Full backup
sqlite3 data/rf_analytics.db ".backup backup_$(date +%Y%m%d).db"

# Restore
cp backup_20240101.db data/rf_analytics.db
```

---

## Maintenance

### Vacuum (PostgreSQL)
```sql
VACUUM ANALYZE;
```

### Reindex (PostgreSQL)
```sql
REINDEX DATABASE rf_analytics;
```

### Check Table Sizes (PostgreSQL)
```sql
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Troubleshooting

### Connection Issues
- Verify PostgreSQL is running: `sudo systemctl status postgresql`
- Check firewall rules
- Verify credentials in `.env` file

### Permission Issues
- Ensure user has proper privileges
- Check `pg_hba.conf` for authentication settings

### Performance Issues
- Check indexes are being used: `EXPLAIN ANALYZE <query>`
- Monitor connection pool usage
- Consider partitioning for large datasets
