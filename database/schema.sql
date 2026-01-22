-- RF Analytics Platform Database Schema
-- PostgreSQL 14+ compatible
--
-- Execution order:
-- 1. CREATE TABLE statements (no dependencies)
-- 2. CREATE INDEX statements (after all tables)
-- 3. CREATE FUNCTION statements (trigger functions)
-- 4. CREATE TRIGGER statements (after functions)
-- 5. CREATE VIEW statements (optional, after all dependencies)

-- ============================================================================
-- TABLES
-- ============================================================================

-- Gateways table: Stores gateway metadata and tracking information
CREATE TABLE IF NOT EXISTS gateways (
    gateway_id VARCHAR(255) PRIMARY KEY,
    first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Devices table: Stores device metadata and tracking information
CREATE TABLE IF NOT EXISTS devices (
    dev_eui VARCHAR(255) PRIMARY KEY,
    first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Uplinks table: Core table storing all uplink events with computed metrics
-- This is the primary table for analytics and reporting
CREATE TABLE IF NOT EXISTS uplinks (
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

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Gateway indexes
CREATE INDEX IF NOT EXISTS idx_gateways_last_seen ON gateways(last_seen);

-- Device indexes
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);

-- Uplink indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_uplinks_dev_eui_timestamp 
    ON uplinks(dev_eui, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_uplinks_gateway_id_timestamp 
    ON uplinks(gateway_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_uplinks_timestamp 
    ON uplinks(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_uplinks_is_best 
    ON uplinks(is_best) WHERE is_best = TRUE;

CREATE INDEX IF NOT EXISTS idx_uplinks_dev_eui_gateway_timestamp 
    ON uplinks(dev_eui, gateway_id, timestamp DESC);

-- ============================================================================
-- TRIGGER FUNCTIONS
-- ============================================================================

-- Function to update gateway last_seen timestamp
CREATE OR REPLACE FUNCTION update_gateway_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE gateways
    SET last_seen = NEW.timestamp,
        updated_at = CURRENT_TIMESTAMP
    WHERE gateway_id = NEW.gateway_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update device last_seen timestamp
CREATE OR REPLACE FUNCTION update_device_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE devices
    SET last_seen = NEW.timestamp,
        updated_at = CURRENT_TIMESTAMP
    WHERE dev_eui = NEW.dev_eui;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to auto-update gateway last_seen when uplink is inserted
CREATE TRIGGER trigger_update_gateway_last_seen
    AFTER INSERT ON uplinks
    FOR EACH ROW
    EXECUTE FUNCTION update_gateway_last_seen();

-- Trigger to auto-update device last_seen when uplink is inserted
CREATE TRIGGER trigger_update_device_last_seen
    AFTER INSERT ON uplinks
    FOR EACH ROW
    EXECUTE FUNCTION update_device_last_seen();

-- ============================================================================
-- VIEWS (Optional, for convenience)
-- ============================================================================

-- View: Gateway Health Summary
CREATE OR REPLACE VIEW gateway_health_summary AS
SELECT 
    g.gateway_id,
    COUNT(u.id) as total_uplinks,
    ROUND(AVG(u.rf_score)::numeric, 2) as avg_rf_score,
    MAX(u.timestamp) as last_seen,
    CASE 
        WHEN AVG(u.rf_score) >= 80 THEN 'HEALTHY'
        WHEN AVG(u.rf_score) >= 50 THEN 'DEGRADED'
        ELSE 'CRITICAL'
    END as status
FROM gateways g
LEFT JOIN uplinks u ON g.gateway_id = u.gateway_id
WHERE u.timestamp >= NOW() - INTERVAL '1 hour'
GROUP BY g.gateway_id;

-- View: Device Health Summary
CREATE OR REPLACE VIEW device_health_summary AS
SELECT 
    d.dev_eui,
    COUNT(u.id) as total_uplinks,
    ROUND(AVG(u.rf_score)::numeric, 2) as avg_rf_score,
    MAX(u.timestamp) as last_seen,
    CASE 
        WHEN AVG(u.rf_score) >= 80 THEN 'HEALTHY'
        WHEN AVG(u.rf_score) >= 50 THEN 'DEGRADED'
        ELSE 'CRITICAL'
    END as rf_status,
    CASE 
        WHEN MAX(u.timestamp) < NOW() - INTERVAL '75 minutes' THEN 'OFFLINE'
        WHEN MAX(u.timestamp) IS NULL THEN 'UNKNOWN'
        ELSE 'ONLINE'
    END as connectivity_status
FROM devices d
LEFT JOIN uplinks u ON d.dev_eui = u.dev_eui
WHERE u.timestamp >= NOW() - INTERVAL '1 hour'
GROUP BY d.dev_eui;
