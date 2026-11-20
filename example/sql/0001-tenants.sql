
CREATE SCHEMA IF NOT EXISTS acme;

CREATE TABLE IF NOT EXISTS acme.addresses (
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

CREATE TABLE IF NOT EXISTS acme.audit_logs (
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

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON acme.audit_logs (entity, entity_id);

CREATE TABLE IF NOT EXISTS acme.users (
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

CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON acme.users (email);

CREATE SCHEMA IF NOT EXISTS globex;

CREATE TABLE IF NOT EXISTS globex.addresses (LIKE acme.addresses INCLUDING ALL);

CREATE TABLE IF NOT EXISTS globex.audit_logs (LIKE acme.audit_logs INCLUDING ALL);

CREATE TABLE IF NOT EXISTS globex.users (LIKE acme.users INCLUDING ALL);

CREATE SCHEMA IF NOT EXISTS swan;

CREATE TABLE IF NOT EXISTS swan.addresses (LIKE acme.addresses INCLUDING ALL);

CREATE TABLE IF NOT EXISTS swan.audit_logs (LIKE acme.audit_logs INCLUDING ALL);

CREATE TABLE IF NOT EXISTS swan.users (LIKE acme.users INCLUDING ALL);

CREATE SCHEMA IF NOT EXISTS dff;

CREATE TABLE IF NOT EXISTS dff.addresses (LIKE acme.addresses INCLUDING ALL);

CREATE TABLE IF NOT EXISTS dff.audit_logs (LIKE acme.audit_logs INCLUDING ALL);

CREATE TABLE IF NOT EXISTS dff.users (LIKE acme.users INCLUDING ALL);
