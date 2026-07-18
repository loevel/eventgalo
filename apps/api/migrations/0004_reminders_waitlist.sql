-- Rappels avant événement (invités + billets) et liste d'attente billetterie.

ALTER TABLE guests ADD COLUMN reminder_sent_at TEXT;
ALTER TABLE tickets ADD COLUMN reminder_sent_at TEXT;

CREATE TABLE waitlist (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES ticket_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_waitlist_category ON waitlist(category_id);
CREATE INDEX idx_waitlist_event ON waitlist(event_id);
