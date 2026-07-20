-- Espace d'administration : rôle plateforme, suspension de compte, journal
-- d'audit et paramètres configurables sans redéploiement.

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','superadmin'));
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended'));
ALTER TABLE users ADD COLUMN suspended_at TEXT;
ALTER TABLE users ADD COLUMN suspended_reason TEXT;

CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT, -- JSON libre
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_audit_log_admin ON admin_audit_log(admin_id);
CREATE INDEX idx_audit_log_created ON admin_audit_log(created_at);

CREATE TABLE platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by TEXT REFERENCES users(id)
);
