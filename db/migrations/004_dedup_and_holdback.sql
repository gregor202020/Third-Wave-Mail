-- Migration 004: Prevent duplicate sends and persist A/B holdback contacts
-- Phase 1: BUG-02 (deduplication) + BUG-03 (holdback persistence)

-- BUG-02: Deduplicate any existing rows before adding constraint
-- Safety step: remove duplicate message rows keeping the earliest row per
-- (campaign_id, contact_id). Uses row_number() so it works with UUID ids.
WITH ranked_messages AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY campaign_id, contact_id
      ORDER BY created_at ASC, id ASC
    ) AS row_num
  FROM messages
)
DELETE FROM messages
WHERE ctid IN (
  SELECT ctid
  FROM ranked_messages
  WHERE row_num > 1
);

-- BUG-02: Add UNIQUE constraint to prevent duplicate sends per campaign/contact
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'messages'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (campaign_id, contact_id)'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT uq_messages_campaign_contact
      UNIQUE (campaign_id, contact_id);
  END IF;
END $$;

-- BUG-03: Create table for A/B holdback contact persistence
-- Replaces Redis-only storage that was lost on restart/eviction
CREATE TABLE IF NOT EXISTS campaign_holdback_contacts (
  campaign_id  bigint NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id   bigint NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_holdback_campaign
  ON campaign_holdback_contacts (campaign_id);
