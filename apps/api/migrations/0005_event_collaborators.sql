-- Co-organisateurs : plusieurs comptes peuvent gérer le même événement.
CREATE TABLE event_collaborators (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (event_id, user_id)
);
CREATE INDEX idx_collaborators_event ON event_collaborators(event_id);
CREATE INDEX idx_collaborators_user ON event_collaborators(user_id);
