/**
 * Centralized environment variable validation and configuration hub.
 * Supports switching between Local Docker and AWS RDS.
 */
const DB_TARGET = process.env.DB_TARGET || 'local'; // 'local' or 'rds'

const configs = {
  local: {
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT),
    database: process.env.PG_DB,
    user: process.env.PG_USER,
    password: process.env.PG_PASS,
    ssl: false
  },
  rds: {
    host: process.env.RDS_HOST,
    port: parseInt(process.env.RDS_PORT),
    database: process.env.RDS_DB,
    user: process.env.RDS_USER,
    password: process.env.RDS_PASS,
    ssl: { rejectUnauthorized: false }
  }
};

const currentDb = configs[DB_TARGET];

// Validate critical secrets
if (DB_TARGET === 'rds' && !currentDb.password) {
    console.error('❌ CRITICAL ERROR: RDS_PASS is missing in the environment!');
    process.exit(1);
}

module.exports = {
  db: currentDb,
  DB_TARGET,
  PORT: process.env.PORT || 8080,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // External Services
  TILE_SERVER_URL: process.env.TILE_SERVER_URL || (DB_TARGET === 'local' ? 'http://localhost:3000' : null),
  NDVI_SERVICE_URL: process.env.NDVI_SERVICE_URL || 'http://localhost:8000',
  GOOGLE_PLACES_KEY: process.env.GOOGLE_PLACES_KEY || null
};
