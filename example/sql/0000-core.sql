-- 0000-core.sql
-- Base database (DB_URL ...?options=-c%20search_path%3Dcore): the tenant registry core.tenants.
-- Its rows make the service multi-tenant. "db" is the connection URL of each tenant; here every tenant is a
-- schema of the same database, but it can be any PostgreSQL server or database.
-- Changes to this table reach running services through the tenants trigger + LISTEN (no restart).

CREATE SCHEMA IF NOT EXISTS core;

CREATE TABLE IF NOT EXISTS core.tenants (
  id          text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text NOT NULL DEFAULT 'System',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text NOT NULL DEFAULT 'System',
  active      boolean NOT NULL DEFAULT true,
  name        text NOT NULL,
  db          text NOT NULL
);

INSERT INTO core.tenants (id, name, db) VALUES
  ('acme', 'Acme', 'postgresql://postgres:postgres@localhost:5432/app?options=-c%20search_path%3Dtenant_acme'),
  ('globex', 'Globex', 'postgresql://postgres:postgres@localhost:5432/app?options=-c%20search_path%3Dtenant_globex')
ON CONFLICT (id) DO NOTHING;

-- x-tenant-id: core uses the base database itself, so it has the module tables too.
CREATE TABLE IF NOT EXISTS core.addresses (
  id          varchar(255) PRIMARY KEY,
  address     text NOT NULL,
  area        varchar(255),
  city        varchar(255),
  state       varchar(255),
  country     varchar(255),
  zipcode     varchar(32),
  type        varchar(100) NOT NULL,
  lat         double precision,
  lng         double precision,
  created_by  varchar(255) NOT NULL DEFAULT 'System',
  updated_by  varchar(255) NOT NULL DEFAULT 'System',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.audit_logs (
  id          varchar(255) PRIMARY KEY,
  entity      varchar(100) NOT NULL,
  entity_id   varchar(255) NOT NULL,
  action      varchar(20) NOT NULL,
  data        jsonb,
  request_id  varchar(128),
  branch_id   varchar(128),
  created_by  varchar(255) NOT NULL DEFAULT 'System',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON core.audit_logs (entity, entity_id);

CREATE TABLE IF NOT EXISTS core.users (
  id          varchar(255) PRIMARY KEY,
  name        text NOT NULL,
  email       varchar(255) NOT NULL,
  mobile      varchar(32),
  persona     varchar(20) NOT NULL DEFAULT 'user',
  active      boolean NOT NULL DEFAULT true,
  created_by  varchar(255) NOT NULL DEFAULT 'System',
  updated_by  varchar(255) NOT NULL DEFAULT 'System',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON core.users (email);
