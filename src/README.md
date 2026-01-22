# Backend Project Structure

## Folder Structure

```
src/
├── app.js                 # Main Express application entry point
├── db/
│   └── connection.js      # PostgreSQL connection pool and database utilities
├── routes/
│   ├── health.js          # Health check endpoint
│   ├── uplink.js          # POST / endpoint for ChirpStack uplinks
│   ├── lastUplink.js      # GET /api/last-uplink endpoint
│   ├── gateways.js        # Gateway-related endpoints
│   └── devices.js         # Device-related endpoints
├── services/
│   ├── uplinkService.js   # Uplink processing and storage logic
│   ├── gatewayService.js  # Gateway health and details logic
│   └── deviceService.js   # Device health and details logic
└── utils/
    ├── rfScore.js         # RF score calculation utilities
    ├── stability.js       # Stability index calculation
    └── connectivity.js    # Connectivity status calculation
```

## Key Components

### Database Connection (`src/db/connection.js`)
- PostgreSQL connection pool using `pg` library
- Automatic schema loading if tables don't exist
- Connection pooling with configurable min/max connections
- Query execution with slow query logging

### Routes (`src/routes/`)
- **health.js**: `GET /health` - Health check
- **uplink.js**: `POST /` - ChirpStack integration endpoint
- **lastUplink.js**: `GET /api/last-uplink` - Most recent uplink
- **gateways.js**: Gateway health and details endpoints
- **devices.js**: Device health and details endpoints

### Services (`src/services/`)
- Business logic separated from routes
- Database queries and data processing
- Transaction handling for data consistency

### Utils (`src/utils/`)
- Reusable utility functions
- RF score calculation
- Stability index calculation
- Connectivity status calculation

## Environment Variables

Create a `.env` file in the project root:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rf_analytics
DB_USER=rf_user
DB_PASSWORD=your_password
DB_POOL_MIN=2
DB_POOL_MAX=10
PORT=8090
```

## Database Schema

The schema is automatically loaded from `database/schema.sql` on first startup if tables don't exist.

Tables:
- `gateways` - Gateway metadata
- `devices` - Device metadata
- `uplinks` - All uplink events with computed metrics

## Starting the Server

```bash
npm install
npm start
```

The server will:
1. Connect to PostgreSQL database
2. Check if tables exist
3. Load schema if needed
4. Start Express server on configured port

## API Endpoints

All endpoints maintain the same interface as the previous in-memory version:

- `GET /health` - Health check
- `POST /` - ChirpStack uplink ingestion
- `GET /api/last-uplink` - Most recent uplink
- `GET /api/gateways/health` - All gateway health metrics
- `GET /api/gateways/:gatewayId` - Specific gateway details
- `GET /api/devices/health` - All device health metrics
- `GET /api/devices/:devEui` - Specific device details
