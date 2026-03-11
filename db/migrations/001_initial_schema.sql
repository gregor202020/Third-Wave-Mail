-- TWMail: Initial Database Schema
-- All tables, indexes, extensions, and triggers.

-- ============================================================================
-- Extensions
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- Note: pg_partman and pg_cron require superuser and are installed separately
-- in production. For dev, partitioned tables use a default partition.

-- ============================================================================
-- users (dashboard access)
-- ============================================================================
CREATE TABLE users (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email           citext NOT NULL UNIQUE,
    password_hash   text NOT NULL,
    name            text NOT NULL,
    role            smallint NOT NULL DEFAULT 2,
    -- 1=admin, 2=editor, 3=viewer
    last_login_at   timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- api_keys
-- ============================================================================
CREATE TABLE api_keys (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            text NOT NULL,
    key_prefix      text NOT NULL,
    key_hash        text NOT NULL,
    scopes          text[] NOT NULL DEFAULT '{read}',
    last_used_at    timestamptz,
    expires_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_user ON api_keys (user_id);
CREATE INDEX idx_api_keys_prefix ON api_keys (key_prefix);

-- ============================================================================
-- contacts
-- ============================================================================
CREATE TABLE contacts (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email             citext NOT NULL UNIQUE,
    status            smallint NOT NULL DEFAULT 1,
    -- 1=active, 2=unsubscribed, 3=bounced, 4=complained, 5=cleaned
    first_name        text,
    last_name         text,
    phone             text,
    company           text,
    city              text,
    country           text,
    timezone          text,
    custom_fields     jsonb NOT NULL DEFAULT '{}'::jsonb,
    source            text,
    engagement_score  smallint DEFAULT 0,
    engagement_tier   smallint DEFAULT 0,
    last_open_at      timestamptz,
    last_click_at     timestamptz,
    last_activity_at  timestamptz,
    subscribed_at     timestamptz,
    unsubscribed_at   timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_status ON contacts (id) WHERE status = 1;
CREATE INDEX idx_contacts_custom_gin ON contacts USING gin (custom_fields jsonb_path_ops);
CREATE INDEX idx_contacts_engagement ON contacts (engagement_tier, engagement_score DESC) WHERE status = 1;
CREATE INDEX idx_contacts_last_activity ON contacts (last_activity_at DESC NULLS LAST) WHERE status = 1;
CREATE INDEX idx_contacts_created ON contacts (created_at DESC);
CREATE INDEX idx_contacts_email ON contacts (email);

-- ============================================================================
-- lists
-- ============================================================================
CREATE TABLE lists (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text NOT NULL,
    description text,
    type        smallint NOT NULL DEFAULT 1,
    -- 1=public, 2=private
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- contact_lists (junction)
-- ============================================================================
CREATE TABLE contact_lists (
    contact_id  bigint NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    list_id     bigint NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    status      smallint NOT NULL DEFAULT 1,
    -- 1=confirmed, 2=unconfirmed, 3=unsubscribed
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (contact_id, list_id)
);

CREATE INDEX idx_contact_lists_list ON contact_lists (list_id, contact_id) WHERE status = 1;

-- ============================================================================
-- segments
-- ============================================================================
CREATE TABLE segments (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text NOT NULL,
    type        smallint NOT NULL DEFAULT 1,
    -- 1=dynamic, 2=static
    rules       jsonb,
    description text,
    cached_count integer,
    cached_at   timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- contact_segments (junction for static segments)
-- ============================================================================
CREATE TABLE contact_segments (
    contact_id  bigint NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    segment_id  bigint NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (contact_id, segment_id)
);

CREATE INDEX idx_contact_segments_segment ON contact_segments (segment_id, contact_id);

-- ============================================================================
-- templates
-- ============================================================================
CREATE TABLE templates (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            text NOT NULL,
    category        text,
    content_html    text,
    content_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
    thumbnail_url   text,
    is_default      boolean DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- campaigns
-- ============================================================================
CREATE TABLE campaigns (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            text NOT NULL,
    status          smallint NOT NULL DEFAULT 1,
    -- 1=draft, 2=scheduled, 3=sending, 4=sent, 5=paused, 6=cancelled
    subject         text,
    preview_text    text,
    from_name       text NOT NULL DEFAULT 'Third Wave BBQ',
    from_email      text NOT NULL DEFAULT 'news@thirdwavebbq.com.au',
    reply_to        text,
    template_id     bigint REFERENCES templates(id),
    content_html    text,
    content_json    jsonb,
    segment_id      bigint REFERENCES segments(id),
    list_id         bigint REFERENCES lists(id),
    scheduled_at    timestamptz,
    timezone        text DEFAULT 'Australia/Melbourne',
    send_started_at timestamptz,
    send_completed_at timestamptz,
    ab_test_enabled boolean NOT NULL DEFAULT false,
    ab_test_config  jsonb,
    resend_enabled  boolean NOT NULL DEFAULT false,
    resend_config   jsonb,
    resend_of       bigint REFERENCES campaigns(id),
    total_sent          integer DEFAULT 0,
    total_delivered     integer DEFAULT 0,
    total_opens         integer DEFAULT 0,
    total_human_opens   integer DEFAULT 0,
    total_clicks        integer DEFAULT 0,
    total_human_clicks  integer DEFAULT 0,
    total_bounces       integer DEFAULT 0,
    total_complaints    integer DEFAULT 0,
    total_unsubscribes  integer DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaigns_status ON campaigns (status, scheduled_at DESC);

-- ============================================================================
-- campaign_variants
-- ============================================================================
CREATE TABLE campaign_variants (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    campaign_id     bigint NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    variant_name    text NOT NULL,
    subject         text NOT NULL,
    preview_text    text,
    content_html    text,
    content_json    jsonb,
    percentage      smallint NOT NULL,
    is_winner       boolean DEFAULT false,
    win_probability real,
    total_sent          integer DEFAULT 0,
    total_opens         integer DEFAULT 0,
    total_human_opens   integer DEFAULT 0,
    total_clicks        integer DEFAULT 0,
    total_human_clicks  integer DEFAULT 0,
    unique_clicks       integer DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_variants_campaign ON campaign_variants (campaign_id);

-- ============================================================================
-- events (partitioned by month)
-- ============================================================================
CREATE TABLE events (
    id              bigint GENERATED ALWAYS AS IDENTITY,
    event_type      smallint NOT NULL,
    -- 1=sent, 2=delivered, 3=open, 4=click, 5=hard_bounce,
    -- 6=soft_bounce, 7=complaint, 8=unsubscribe, 9=machine_open
    contact_id      bigint NOT NULL,
    campaign_id     bigint,
    variant_id      bigint,
    message_id      uuid,
    event_time      timestamptz NOT NULL,
    metadata        jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id, event_time)
) PARTITION BY RANGE (event_time);

CREATE TABLE events_default PARTITION OF events DEFAULT;

CREATE INDEX idx_events_campaign_stats ON events (campaign_id, event_type, event_time);
CREATE INDEX idx_events_contact_timeline ON events (contact_id, event_time DESC);
CREATE INDEX idx_events_message ON events (message_id, event_type);
CREATE INDEX idx_events_bounces ON events (event_time DESC, contact_id) WHERE event_type IN (5, 6, 7);

-- ============================================================================
-- campaign_stats_daily
-- ============================================================================
CREATE TABLE campaign_stats_daily (
    campaign_id     bigint NOT NULL,
    variant_id      bigint NOT NULL DEFAULT 0,
    event_type      smallint NOT NULL,
    event_date      date NOT NULL,
    total_count     integer NOT NULL DEFAULT 0,
    unique_contacts integer NOT NULL DEFAULT 0,
    PRIMARY KEY (campaign_id, event_type, event_date, variant_id)
);

-- ============================================================================
-- messages
-- ============================================================================
CREATE TABLE messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     bigint NOT NULL REFERENCES campaigns(id),
    variant_id      bigint REFERENCES campaign_variants(id),
    contact_id      bigint NOT NULL REFERENCES contacts(id),
    status          smallint NOT NULL DEFAULT 1,
    -- 1=queued, 2=sent, 3=delivered, 4=opened, 5=clicked,
    -- 6=bounced, 7=complained, 8=unsubscribed
    ses_message_id  text,
    sent_at         timestamptz,
    delivered_at    timestamptz,
    first_open_at   timestamptz,
    first_click_at  timestamptz,
    is_machine_open boolean DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_campaign_contact ON messages (campaign_id, contact_id);
CREATE INDEX idx_messages_ses ON messages (ses_message_id);
CREATE INDEX idx_messages_status ON messages (campaign_id, status);

-- ============================================================================
-- automations
-- ============================================================================
CREATE TABLE automations (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            text NOT NULL,
    type            smallint NOT NULL,
    -- 1=resend_non_openers, 2=drip_sequence, 3=engagement_trigger
    trigger_config  jsonb NOT NULL,
    enabled         boolean NOT NULL DEFAULT true,
    last_run_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE automation_steps (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    automation_id   bigint NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    step_order      smallint NOT NULL,
    action          smallint NOT NULL,
    -- 1=send_email, 2=wait, 3=condition, 4=update_contact
    config          jsonb NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_steps_automation ON automation_steps (automation_id, step_order);

CREATE TABLE automation_log (
    id              bigint GENERATED ALWAYS AS IDENTITY,
    automation_id   bigint NOT NULL,
    contact_id      bigint NOT NULL,
    step_id         bigint,
    status          smallint NOT NULL,
    -- 1=started, 2=completed, 3=failed, 4=skipped
    metadata        jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE automation_log_default PARTITION OF automation_log DEFAULT;

-- ============================================================================
-- assets
-- ============================================================================
CREATE TABLE assets (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    filename        text NOT NULL,
    original_name   text NOT NULL,
    mime_type       text NOT NULL,
    size_bytes      bigint NOT NULL,
    storage_type    smallint NOT NULL DEFAULT 1,
    -- 1=local, 2=s3
    url             text NOT NULL,
    thumbnail_url   text,
    campaign_id     bigint REFERENCES campaigns(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- imports
-- ============================================================================
CREATE TABLE imports (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type            smallint NOT NULL,
    -- 1=paste, 2=csv, 3=api
    status          smallint NOT NULL DEFAULT 1,
    -- 1=processing, 2=completed, 3=failed
    total_rows      integer DEFAULT 0,
    new_contacts    integer DEFAULT 0,
    updated_contacts integer DEFAULT 0,
    skipped         integer DEFAULT 0,
    mapping_config  jsonb,
    mapping_preset  text,
    errors          jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz
);

-- ============================================================================
-- webhook_endpoints
-- ============================================================================
CREATE TABLE webhook_endpoints (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    url             text NOT NULL,
    secret          text NOT NULL,
    events          text[] NOT NULL,
    active          boolean NOT NULL DEFAULT true,
    last_triggered_at timestamptz,
    failure_count   integer DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- webhook_deliveries
-- ============================================================================
CREATE TABLE webhook_deliveries (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    endpoint_id     bigint NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    event_type      text NOT NULL,
    payload         jsonb NOT NULL,
    status          smallint NOT NULL DEFAULT 1,
    -- 1=pending, 2=delivered, 3=failed
    response_code   smallint,
    response_body   text,
    attempts        smallint DEFAULT 0,
    next_retry_at   timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries (endpoint_id, created_at DESC);

-- ============================================================================
-- updated_at trigger function
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lists_updated_at BEFORE UPDATE ON lists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_segments_updated_at BEFORE UPDATE ON segments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaign_variants_updated_at BEFORE UPDATE ON campaign_variants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_automations_updated_at BEFORE UPDATE ON automations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Seed: default admin user (password: "admin123" -- CHANGE IN PRODUCTION)
-- bcrypt hash of "admin123" with 12 rounds
-- ============================================================================
INSERT INTO users (email, password_hash, name, role) VALUES (
    'admin@twmail.local',
    '$2b$12$LJ3m4ys3LzPGmOgmByF6Nu/vrGYHfkBsGMpjHXHxSwPBmhqOC7hWu',
    'Admin',
    1
);
