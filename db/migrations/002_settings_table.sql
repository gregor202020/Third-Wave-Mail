-- Settings table (single-row for organization-level settings)
CREATE TABLE settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  organization_name TEXT NOT NULL DEFAULT '',
  default_sender_email TEXT NOT NULL DEFAULT '',
  default_sender_name TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default row
INSERT INTO settings (id) VALUES (1);
