# Docker Setup Guide

## Quick Start

Start all services with one command:

```bash
docker compose up -d
```

This will:
1. Start PostgreSQL database
2. Wait for database to be ready
3. Start backend (auto-loads schema if needed)
4. Start frontend
5. Start Nginx reverse proxy

## Services

### PostgreSQL
- **Container**: `rf-analytics-postgres`
- **Port**: 5432 (mapped to host)
- **Volume**: `postgres_data` (persistent storage)
- **Health Check**: Automatic readiness check

### Backend
- **Container**: `rf-analytics-backend`
- **Port**: 8090 (internal)
- **Depends on**: PostgreSQL (waits for health check)
- **Auto-schema**: Loads schema automatically on first startup

### Frontend
- **Container**: `rf-analytics-frontend`
- **Port**: 80 (internal, served by Nginx)

### Nginx
- **Container**: `rf-analytics-nginx`
- **Port**: 80 (mapped to host)
- **Routes**: `/` → frontend, `/api/` → backend

## Environment Variables

Create a `.env` file in the project root:

```bash
# Database
DB_NAME=rf_analytics
DB_USER=rf_user
DB_PASSWORD=your_secure_password

# Server
PORT=8090
NODE_ENV=production

# Optional overrides
LOG_LEVEL=info
WEBHOOK_RATE_LIMIT=100
```

## Database Persistence

PostgreSQL data is stored in a Docker volume:
- **Volume name**: `postgres_data`
- **Location**: Managed by Docker
- **Persistence**: Data survives container restarts

To backup:
```bash
docker compose exec postgres pg_dump -U rf_user rf_analytics > backup.sql
```

To restore:
```bash
docker compose exec -T postgres psql -U rf_user rf_analytics < backup.sql
```

## Health Checks

All services have health checks:
- **PostgreSQL**: `pg_isready` check
- **Backend**: HTTP `/health` endpoint
- **Frontend**: Nginx serves static files
- **Nginx**: Container health

## Logs

View logs:
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f postgres
```

## Stopping Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes (⚠️ deletes database)
docker compose down -v
```

## Development Override

For local development, create `docker-compose.override.yml`:

```yaml
services:
  backend:
    volumes:
      - ./src:/app/src:ro
    environment:
      LOG_LEVEL: debug
```

This enables hot-reload and debug logging.

## Troubleshooting

### Database not ready
```bash
# Check PostgreSQL logs
docker compose logs postgres

# Check if database is healthy
docker compose ps postgres
```

### Backend can't connect to database
```bash
# Verify environment variables
docker compose exec backend env | grep DB_

# Test connection manually
docker compose exec backend node -e "require('./src/db/connection').pool.query('SELECT NOW()').then(r => console.log(r.rows))"
```

### Schema not loading
```bash
# Check backend logs
docker compose logs backend | grep -i schema

# Manually trigger schema load
docker compose exec backend node -e "require('./src/db/connection').initializeDatabase()"
```

## Production Deployment

1. Set secure passwords in `.env`
2. Use Docker secrets for sensitive data
3. Configure proper network security
4. Set up regular backups
5. Monitor health checks

## Volume Management

List volumes:
```bash
docker volume ls | grep postgres_data
```

Inspect volume:
```bash
docker volume inspect rf-analytics_postgres_data
```

Remove volume (⚠️ deletes all data):
```bash
docker volume rm rf-analytics_postgres_data
```
