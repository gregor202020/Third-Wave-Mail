-- Migration 004: Prevent duplicate sends and persist A/B holdback contacts
-- Phase 1: BUG-02 (deduplication) + BUG-03 (holdback persistence)

-- BUG-02: Deduplicate any existing rows before adding constraint
-- Safety step: remove duplicate message rows keeping the earliest (lowest id)
DELETE FROM messages
WHERE id NOT IN (
  SELECT MIN(id)
  FROM messages
  GROUP BY campaign_id, contact_id
);

-- BUG-02: Add UNIQUE constraint to prevent duplicate sends per campaign/contact
ALTER TABLE messages
  ADD CONSTRAINT uq_messages_campaign_contact
  UNIQUE (campaign_id, contact_id);

-- BUG-03: Create table for A/B holdback contact persistence
-- Replaces Redis-only storage that was lost on restart/eviction
CREATE TABLE IF NOT EXISTS campaign_holdback_contacts (
  campaign_id  bigint NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id   bigint NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_holdback_campaign
  ON campaign_holdback_contacts (campaign_id);
