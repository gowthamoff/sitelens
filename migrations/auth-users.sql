-- SiteLens — auth users table (JWT login)
-- Apply: psql -h localhost -p 5400 -U <user> -d osm-tn -f migrations/auth-users.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text NOT NULL,             -- bcrypt hash, never the raw password
  role          text NOT NULL DEFAULT 'user',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive unique email (so Foo@x.com == foo@x.com)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uniq ON users (lower(email));
