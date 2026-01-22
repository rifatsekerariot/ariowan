-- RF Analytics Platform Database Schema
-- SQLite-compatible version

-- ============================================================================
-- GATEWAYS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS gateways (
    gateway_id TEXT PRIMARY KEY,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gateways_last_seen ON gateways(last_seen);

-- ============================================================================
-- DEVICES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS devices (
    dev_eui TEXT PRIMARY KEY,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);

-- ============================================================================
-- UPLINKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS uplinks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dev_eui TEXT NOT NULL,
    gateway_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    rssi REAL NOT NULL,
    snr REAL NOT NULL,
    rf_score INTEGER NOT NULL,
    is_best INTEGER NOT NULL DEFAULT 0,  -- SQLite uses INTEGER for boolean (0/1)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (dev_eui) REFERENCES devices(dev_eui) ON DELETE CASCADE,
    FOREIGN KEY (gateway_id) REFERENCES gateways(gateway_id) ON DELETE CASCADE
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_uplinks_dev_eui_timestamp 
    ON uplinks(dev_eui, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_uplinks_gateway_id_timestamp 
    ON uplinks(gateway_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_uplinks_timestamp 
    ON uplinks(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_uplinks_is_best 
    ON uplinks(is_best) WHERE is_best = 1;

CREATE INDEX IF NOT EXISTS idx_uplinks_dev_eui_gateway_timestamp 
    ON uplinks(dev_eui, gateway_id, timestamp DESC);

-- ============================================================================
-- TRIGGERS (SQLite-compatible)
-- ============================================================================

-- Trigger to update gateway last_seen
CREATE TRIGGER IF NOT EXISTS trigger_update_gateway_last_seen
    AFTER INSERT ON uplinks
    FOR EACH ROW
BEGIN
    UPDATE gateways
    SET last_seen = NEW.timestamp,
        updated_at = datetime('now')
    WHERE gateway_id = NEW.gateway_id;
END;

-- Trigger to update device last_seen
CREATE TRIGGER IF NOT EXISTS trigger_update_device_last_seen
    AFTER INSERT ON uplinks
    FOR EACH ROW
BEGIN
    UPDATE devices
    SET last_seen = NEW.timestamp,
        updated_at = datetime('now')
    WHERE dev_eui = NEW.dev_eui;
END;
