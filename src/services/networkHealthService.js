const db = require('../db/connection');
const logger = require('../utils/logger');

/**
 * Calculate Network Health Score
 * Composite score combining:
 * - RF Quality (40%)
 * - Device battery health (20%)
 * - Downlink success rate (20%)
 * - Error rate (20%)
 * 
 * Score range: 0-100
 * 
 * @returns {Promise<Object>} Network health score and component breakdown
 */
async function calculateNetworkHealth() {
  try {
    // 1. RF Quality (40%) - Average RF score from uplinks (last 24h)
    const rfQualityResult = await db.query(`
      SELECT 
        COALESCE(AVG(rf_score), 0) as avg_rf_score,
        COUNT(*) as uplink_count
      FROM uplinks
      WHERE timestamp >= NOW() - INTERVAL '24 hours'
    `);
    
    const avgRfScore = rfQualityResult.rows[0]?.avg_rf_score 
      ? parseFloat(rfQualityResult.rows[0].avg_rf_score) 
      : 0;
    const uplinkCount = parseInt(rfQualityResult.rows[0]?.uplink_count || 0, 10);
    
    // RF Quality score: normalize avg_rf_score (0-100) to 0-100
    // Since rf_score is already 40, 70, or 100, we can use it directly
    const rfQualityScore = Math.min(100, Math.max(0, avgRfScore));
    
    // 2. Device Battery Health (20%) - Average battery level (if available)
    let batteryHealthScore = 50; // Default if no battery data
    
    try {
      // Check if battery_level column exists
      const columnCheck = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'devices' 
        AND column_name = 'battery_level'
      `);
      
      if (columnCheck.rows.length > 0) {
        // Column exists, calculate average battery health
        const batteryResult = await db.query(`
          SELECT 
            COALESCE(AVG(battery_level), 0) as avg_battery,
            COUNT(*) as device_count
          FROM devices
          WHERE battery_level IS NOT NULL
            AND last_seen >= NOW() - INTERVAL '24 hours'
        `);
        
        const avgBattery = batteryResult.rows[0]?.avg_battery 
          ? parseFloat(batteryResult.rows[0].avg_battery) 
          : null;
        const deviceCount = parseInt(batteryResult.rows[0]?.device_count || 0, 10);
        
        if (avgBattery !== null && deviceCount > 0) {
          // Battery level is typically 0-100 or 0-255, normalize to 0-100
          // Assume 0-100 range, if 0-255 then divide by 2.55
          const normalizedBattery = avgBattery > 100 ? avgBattery / 2.55 : avgBattery;
          batteryHealthScore = Math.min(100, Math.max(0, normalizedBattery));
        }
      }
    } catch (error) {
      logger.debug('Error calculating battery health, using default', { error: error.message });
    }
    
    // 3. Downlink Success Rate (20%) - Calculate from downlink_events
    let downlinkSuccessScore = 50; // Default if no downlink data
    
    try {
      // Check if downlink_events table exists
      const tableCheck = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'downlink_events'
        )
      `);
      
      if (tableCheck.rows[0]?.exists) {
        // Calculate downlink success rate (last 24h)
        // Success = ack events with acknowledged=true
        // Attempts = txack events (all transmission attempts)
        const downlinkResult = await db.query(`
          SELECT 
            COUNT(CASE WHEN event_type = 'txack' THEN 1 END) as total_attempts,
            COUNT(CASE WHEN event_type = 'ack' AND acknowledged = true THEN 1 END) as successful_acks
          FROM downlink_events
          WHERE timestamp >= NOW() - INTERVAL '24 hours'
        `);
        
        const totalAttempts = parseInt(downlinkResult.rows[0]?.total_attempts || 0, 10);
        const successfulAcks = parseInt(downlinkResult.rows[0]?.successful_acks || 0, 10);
        
        if (totalAttempts > 0) {
          const successRate = (successfulAcks / totalAttempts) * 100;
          downlinkSuccessScore = Math.min(100, Math.max(0, successRate));
        }
      }
    } catch (error) {
      logger.debug('Error calculating downlink success, using default', { error: error.message });
    }
    
    // 4. Error Rate (20%) - Calculate from device_logs (ERROR level)
    let errorRateScore = 100; // Default if no error data (no errors = perfect)
    
    try {
      // Check if device_logs table exists
      const tableCheck = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'device_logs'
        )
      `);
      
      if (tableCheck.rows[0]?.exists) {
        // Calculate error rate (last 24h)
        // Error rate = (ERROR logs / total activity) * 100
        // Total activity = uplinks + downlink attempts
        const errorResult = await db.query(`
          SELECT COUNT(*) as error_count
          FROM device_logs
          WHERE level = 'ERROR'
            AND timestamp >= NOW() - INTERVAL '24 hours'
        `);
        
        const errorCount = parseInt(errorResult.rows[0]?.error_count || 0, 10);
        
        // Total activity = uplinks + downlink attempts
        const totalActivity = uplinkCount;
        
        if (totalActivity > 0) {
          // Error rate as percentage (lower is better)
          const errorRate = (errorCount / totalActivity) * 100;
          // Convert to score: 0% error = 100 score, 20% error = 0 score
          // Linear scale: score = 100 - (errorRate * 5), capped at 0-100
          // This means: 0% = 100, 5% = 75, 10% = 50, 15% = 25, 20%+ = 0
          errorRateScore = Math.max(0, Math.min(100, 100 - (errorRate * 5)));
        }
      }
    } catch (error) {
      logger.debug('Error calculating error rate, using default', { error: error.message });
    }
    
    // Calculate composite score with weights
    const compositeScore = 
      (rfQualityScore * 0.40) +
      (batteryHealthScore * 0.20) +
      (downlinkSuccessScore * 0.20) +
      (errorRateScore * 0.20);
    
    // Round to 2 decimal places and ensure 0-100 range
    const finalScore = Math.round(compositeScore * 100) / 100;
    const clampedScore = Math.min(100, Math.max(0, finalScore));
    
    return {
      score: clampedScore,
      components: {
        rfQuality: {
          score: Math.round(rfQualityScore * 100) / 100,
          weight: 0.40,
          contribution: Math.round(rfQualityScore * 0.40 * 100) / 100,
          dataPoints: uplinkCount,
        },
        batteryHealth: {
          score: Math.round(batteryHealthScore * 100) / 100,
          weight: 0.20,
          contribution: Math.round(batteryHealthScore * 0.20 * 100) / 100,
        },
        downlinkSuccess: {
          score: Math.round(downlinkSuccessScore * 100) / 100,
          weight: 0.20,
          contribution: Math.round(downlinkSuccessScore * 0.20 * 100) / 100,
        },
        errorRate: {
          score: Math.round(errorRateScore * 100) / 100,
          weight: 0.20,
          contribution: Math.round(errorRateScore * 0.20 * 100) / 100,
        },
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Error calculating network health', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

module.exports = {
  calculateNetworkHealth,
};
