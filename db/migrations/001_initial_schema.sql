-- ============================================================================
-- 001_initial_schema.sql
-- Complete PostgreSQL schema for Third Wave Mail
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- Extensions
-- --------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- --------------------------------------------------------------------------
-- Utility: auto-update updated_at trigger function
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- users
-- --------------------------------------------------------------------------
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         CITEXT NOT NULL UNIQUE,
  password_hash TEXT   NOT NULL DEFAULT '',
  name          TEXT   NOT NULL DEFAULT '',
  role          SMALLINT NOT NULL DEFAULT 3,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------------------------
-- api_keys
-- --------------------------------------------------------------------------
CREATE TABLE api_keys (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT '',
  key_prefix   TEXT NOT NULL DEFAULT '',
  key_hash     TEXT NOT NULL DEFAULT '',
  scopes       TEXT[] NOT NULL DEFAULT '{}',
  expires_at   TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_prefix  ON api_keys (key_prefix);
CREATE INDEX idx_api_keys_user_id ON api_keys (user_id);

CREATE TRIGGER trg_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------------------------
-- contacts
-- --------------------------------------------------------------------------
CREATE TABLE contacts (
  id               SERIAL PRIMARY KEY,
  email            CITEXT NOT NULL UNIQUE,
  first_name       TEXT NOT NULL DEFAULT '',
  last_name        TEXT NOT NULL DEFAULT '',
  phone            TEXT NOT NULL DEFAULT '',
  company          TEXT NOT NULL DEFAULT '',
  city             TEXT NOT NULL DEFAULT '',
  country          TEXT NOT NULL DEFAULT '',
  timezone         TEXT NOT NULL DEFAULT '',
  status           SMALLINT NOT NULL DEFAULT 1,
  custom_fields    JSONB NOT NULL DEFAULT '{}',
  source           TEXT NOT NULL DEFAULT '',
  engagement_score REAL NOT NULL DEFAULT 0,
  engagement_tier  SMALLINT,
  last_open_at     TIMESTAMPTZ,
  last_click_at    TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  subscribed_at    TIMESTAMPTZ,
  unsubscribed_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contacts_status     ON contacts (status);
CREATE INDEX idx_contacts_email      ON contacts (email);
CREATE INDEX idx_contacts_company    ON contacts (company);
CREATE INDEX idx_contacts_country    ON contacts (country);
CREATE INDEX idx_contacts_engagement ON contacts (engagement_score);
CREATE INDEX idx_contacts_created_at ON contacts (created_at);

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------------------------
-- lists
-- --------------------------------------------------------------------------
CREATE TABLE lists (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  type        SMALLINT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_lists_updated_at
  BEFORE UPDATE ON lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------------------------
-- contact_lists
-- --------------------------------------------------------------------------
CREATE TABLE contact_lists (
  contact_id INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  list_id    INT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  status     SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_id, list_id)
);

-- --------------------------------------------------------------------------
-- segments
-- --------------------------------------------------------------------------
CREATE TABLE segments (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  type         SMALLINT NOT NULL DEFAULT 1,
  rules        JSONB NOT NULL DEFAULT '{}',
  cached_count INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_segments_updated_at
  BEFORE UPDATE ON segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------------------------
-- contact_segments
-- --------------------------------------------------------------------------
CREATE TABLE contact_segments (
  contact_id INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  segment_id INT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_id, segment_id)
);

-- --------------------------------------------------------------------------
-- templates
-- --------------------------------------------------------------------------
CREATE TABLE templates (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT '',
  content_html  TEXT NOT NULL DEFAULT '',
  content_json  JSONB,
  thumbnail_url TEXT NOT NULL DEFAULT '',
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------------------------
-- campaigns
-- --------------------------------------------------------------------------
CREATE TABLE campaigns (
  id                      SERIAL PRIMARY KEY,
  name                    TEXT NOT NULL DEFAULT '',
  status                  SMALLINT NOT NULL DEFAULT 1,
  subject                 TEXT NOT NULL DEFAULT '',
  preview_text            TEXT NOT NULL DEFAULT '',
  from_name               TEXT NOT NULL DEFAULT '',
  from_email              TEXT NOT NULL DEFAULT '',
  reply_to                TEXT NOT NULL DEFAULT '',
  template_id             INT REFERENCES templates(id),
  content_html            TEXT NOT NULL DEFAULT '',
  content_json            JSONB,
  segment_id              INT REFERENCES segments(id),
  list_id                 INT REFERENCES lists(id),
  ab_test_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  ab_test_config          JSONB,
  resend_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  resend_config           JSONB,
  resend_of               INT REFERENCES campaigns(id),
  tags                    TEXT[] NOT NULL DEFAULT '{}',
  utm_enabled             BOOLEAN NOT NULL DEFAULT FALSE,
  utm_source              TEXT NOT NULL DEFAULT '',
  utm_medium              TEXT NOT NULL DEFAULT '',
  utm_campaign            TEXT NOT NULL DEFAULT '',
  utm_content             TEXT NOT NULL DEFAULT '',
  ga_tracking             BOOLEAN NOT NULL DEFAULT FALSE,
  tracking_domain         TEXT NOT NULL DEFAULT '',
  send_time_optimization  BOOLEAN NOT NULL DEFAULT FALSE,
  total_sent              INT NOT NULL DEFAULT 0,
  total_delivered         INT NOT NULL DEFAULT 0,
  total_opens             INT NOT NULL DEFAULT 0,
  total_human_opens       INT NOT NULL DEFAULT 0,
  total_clicks            INT NOT NULL DEFAULT 0,
  total_human_clicks      INT NOT NULL DEFAULT 0,
  total_bounces           INT NOT NULL DEFAULT 0,
  total_complaints        INT NOT NULL DEFAULT 0,
  total_unsubscribes      INT NOT NULL DEFAULT 0,
  scheduled_at            TIMESTAMPTZ,
  timezone                TEXT NOT NULL DEFAULT '',
  send_started_at         TIMESTAMPTZ,
  send_completed_at       TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaigns_status    ON campaigns (status);
CREATE INDEX idx_campaigns_scheduled ON campaigns (scheduled_at) WHERE scheduled_at IS NOT NULL;

CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------------------------
-- campaign_variants
-- --------------------------------------------------------------------------
CREATE TABLE campaign_variants (
  id                 SERIAL PRIMARY KEY,
  campaign_id        INT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  variant_name       TEXT NOT NULL DEFAULT '',
  subject            TEXT NOT NULL DEFAULT '',
  content_html       TEXT NOT NULL DEFAULT '',
  content_json       JSONB,
  percentage         SMALLINT NOT NULL DEFAULT 50,
  is_winner          BOOLEAN NOT NULL DEFAULT FALSE,
  win_probability    REAL,
  total_sent         INT NOT NULL DEFAULT 0,
  total_delivered    INT NOT NULL DEFAULT 0,
  total_opens        INT NOT NULL DEFAULT 0,
  total_human_opens  INT NOT NULL DEFAULT 0,
  total_clicks       INT NOT NULL DEFAULT 0,
  total_human_clicks INT NOT NULL DEFAULT 0,
  total_bounces      INT NOT NULL DEFAULT 0,
  total_complaints   INT NOT NULL DEFAULT 0,
  total_unsubscribes INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_campaign_variants_updated_at
  BEFORE UPDATE ON campaign_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------------------------
-- campaign_holdback_contacts
-- --------------------------------------------------------------------------
CREATE TABLE campaign_holdback_contacts (
  campaign_id INT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id  INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, contact_id)
);

-- --------------------------------------------------------------------------
-- messages
-- --------------------------------------------------------------------------
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     INT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  variant_id      INT REFERENCES campaign_variants(id) ON DELETE SET NULL,
  contact_id      INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status          SMALLINT NOT NULL DEFAULT 1,
  ses_message_id  TEXT NOT NULL DEFAULT '',
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  first_open_at   TIMESTAMPTZ,
  first_click_at  TIMESTAMPTZ,
  is_machine_open BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, contact_id)
);

CREATE INDEX idx_messages_campaign ON messages (campaign_id);
CREATE INDEX idx_messages_contact  ON messages (contact_id);
CREATE INDEX idx_messages_ses      ON messages (ses_message_id) WHERE ses_message_id != '';
CREATE INDEX idx_messages_status   ON messages (status);

CREATE TRIGGER trg_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------------------------
-- events (partitioned by event_time)
-- --------------------------------------------------------------------------
CREATE TABLE events (
  id          BIGSERIAL,
  event_type  SMALLINT NOT NULL,
  contact_id  INT,
  campaign_id INT,
  variant_id  INT,
  message_id  UUID,
  event_time  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata    JSONB,
  PRIMARY KEY (id, event_time)
) PARTITION BY RANGE (event_time);

-- Indexes on the parent table (inherited by partitions)
CREATE INDEX idx_events_campaign_stats   ON events (campaign_id, event_type, event_time);
CREATE INDEX idx_events_contact_timeline ON events (contact_id, event_time DESC);
CREATE INDEX idx_events_message          ON events (message_id);

-- Partitioned parent tables cannot enforce a unique index on (message_id, event_type)
-- unless the partition key is included. Keep a lookup index here and let the
-- application perform dedup with an advisory lock + existence check.
CREATE INDEX idx_events_message_type_time
  ON events (message_id, event_type, event_time DESC)
  WHERE message_id IS NOT NULL AND event_type IN (5, 6, 7);

-- Create monthly partitions 2025-2027
DO $$
DECLARE
  y INT;
  m INT;
  start_date TEXT;
  end_date   TEXT;
  part_name  TEXT;
BEGIN
  FOR y IN 2025..2027 LOOP
    FOR m IN 1..12 LOOP
      start_date := FORMAT('%s-%s-01', y, LPAD(m::TEXT, 2, '0'));
      IF m = 12 THEN
        end_date := FORMAT('%s-01-01', y + 1);
      ELSE
        end_date := FORMAT('%s-%s-01', y, LPAD((m + 1)::TEXT, 2, '0'));
      END IF;
      part_name := FORMAT('events_y%sm%s', y, LPAD(m::TEXT, 2, '0'));

      EXECUTE FORMAT(
        'CREATE TABLE %I PARTITION OF events FOR VALUES FROM (%L) TO (%L)',
        part_name, start_date, end_date
      );
    END LOOP;
  END LOOP;
END;
$$;

-- --------------------------------------------------------------------------
-- campaign_stats_daily
-- --------------------------------------------------------------------------
CREATE TABLE campaign_stats_daily (
  id              SERIAL PRIMARY KEY,
  campaign_id     INT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  variant_id      INT REFERENCES campaign_variants(id) ON DELETE CASCADE,
  event_type      SMALLINT NOT NULL,
  event_date      DATE NOT NULL,
  total_count     INT NOT NULL DEFAULT 0,
  unique_contacts INT NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, variant_id, event_type, event_date)
);

-- --------------------------------------------------------------------------
-- automations
-- --------------------------------------------------------------------------
CREATE TABLE automations (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL DEFAULT '',
  type           SMALLINT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  last_run_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_automations_updated_at
  BEFORE UPDATE ON automations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------------------------
-- automation_steps
-- --------------------------------------------------------------------------
CREATE TABLE automation_steps (
  id            SERIAL PRIMARY KEY,
  automation_id INT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  step_order    INT NOT NULL DEFAULT 0,
  action        SMALLINT NOT NULL,
  config        JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_automation_steps_updated_at
  BEFORE UPDATE ON automation_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------------------------
-- automation_log (partitioned by executed_at)
-- --------------------------------------------------------------------------
CREATE TABLE automation_log (
  id            BIGSERIAL,
  automation_id INT,
  step_id       INT,
  contact_id    INT,
  status        SMALLINT NOT NULL DEFAULT 1,
  result        JSONB,
  executed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, executed_at)
) PARTITION BY RANGE (executed_at);

CREATE INDEX idx_automation_log_automation ON automation_log (automation_id, executed_at DESC);
CREATE INDEX idx_automation_log_contact    ON automation_log (contact_id, executed_at DESC);

-- Create monthly partitions 2025-2027
DO $$
DECLARE
  y INT;
  m INT;
  start_date TEXT;
  end_date   TEXT;
  part_name  TEXT;
BEGIN
  FOR y IN 2025..2027 LOOP
    FOR m IN 1..12 LOOP
      start_date := FORMAT('%s-%s-01', y, LPAD(m::TEXT, 2, '0'));
      IF m = 12 THEN
        end_date := FORMAT('%s-01-01', y + 1);
      ELSE
        end_date := FORMAT('%s-%s-01', y, LPAD((m + 1)::TEXT, 2, '0'));
      END IF;
      part_name := FORMAT('automation_log_y%sm%s', y, LPAD(m::TEXT, 2, '0'));

      EXECUTE FORMAT(
        'CREATE TABLE %I PARTITION OF automation_log FOR VALUES FROM (%L) TO (%L)',
        part_name, start_date, end_date
      );
    END LOOP;
  END LOOP;
END;
$$;

-- --------------------------------------------------------------------------
-- assets
-- --------------------------------------------------------------------------
CREATE TABLE assets (
  id            SERIAL PRIMARY KEY,
  filename      TEXT NOT NULL DEFAULT '',
  original_name TEXT NOT NULL DEFAULT '',
  mime_type     TEXT NOT NULL DEFAULT '',
  size_bytes    BIGINT NOT NULL DEFAULT 0,
  storage_type  SMALLINT NOT NULL DEFAULT 1,
  url           TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT NOT NULL DEFAULT '',
  campaign_id   INT REFERENCES campaigns(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------------------------
-- imports
-- --------------------------------------------------------------------------
CREATE TABLE imports (
  id               SERIAL PRIMARY KEY,
  type             SMALLINT NOT NULL,
  status           SMALLINT NOT NULL DEFAULT 1,
  total_rows       INT NOT NULL DEFAULT 0,
  new_contacts     INT NOT NULL DEFAULT 0,
  updated_contacts INT NOT NULL DEFAULT 0,
  skipped          INT NOT NULL DEFAULT 0,
  mapping_config   JSONB,
  errors           JSONB NOT NULL DEFAULT '[]',
  list_id          INT REFERENCES lists(id) ON DELETE SET NULL,
  update_existing  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_imports_updated_at
  BEFORE UPDATE ON imports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------------------------
-- webhook_endpoints
-- --------------------------------------------------------------------------
CREATE TABLE webhook_endpoints (
  id                SERIAL PRIMARY KEY,
  url               TEXT NOT NULL DEFAULT '',
  secret            TEXT NOT NULL DEFAULT '',
  events            TEXT[] NOT NULL DEFAULT '{}',
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  failure_count     INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_webhook_endpoints_updated_at
  BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------------------------
-- webhook_deliveries
-- --------------------------------------------------------------------------
CREATE TABLE webhook_deliveries (
  id            SERIAL PRIMARY KEY,
  endpoint_id   INT NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL DEFAULT '',
  payload       JSONB NOT NULL DEFAULT '{}',
  status        SMALLINT NOT NULL DEFAULT 1,
  response_code INT,
  response_body TEXT NOT NULL DEFAULT '',
  attempts      INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries (endpoint_id);
CREATE INDEX idx_webhook_deliveries_status   ON webhook_deliveries (status) WHERE status = 1;

CREATE TRIGGER trg_webhook_deliveries_updated_at
  BEFORE UPDATE ON webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------------------------
-- settings (singleton row)
-- --------------------------------------------------------------------------
CREATE TABLE settings (
  id                   INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  organization_name    TEXT NOT NULL DEFAULT '',
  default_sender_email TEXT NOT NULL DEFAULT '',
  default_sender_name  TEXT NOT NULL DEFAULT '',
  timezone             TEXT NOT NULL DEFAULT 'UTC',
  physical_address     TEXT NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
