const { Pool } = require("pg");
const { db, DB_TARGET } = require("./env");

const pool = new Pool({
  user: db.user,
  host: db.host,
  database: db.database,
  password: db.password,
  port: db.port,
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000,
  statement_timeout: 300000,
  ssl: db.ssl,
});

console.log(`[DB] Initializing for target: ${DB_TARGET.toUpperCase()}`);


pool.on("error", (err) => {
  console.error("[DB] Unexpected error on idle client:", err.message);
});

// Test the connection on startup
pool
  .query("SELECT 1")
  .then(() => {
    console.log("[DB] Connected to:", db.database);
  })
  .catch((err) => {
    console.error("[DB] Connection failed:", err.message);
  });

module.exports = pool;
