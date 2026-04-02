-- Migration 005: CAN-SPAM / CASL compliance
-- COMP-01: Unique index for SNS bounce/complaint dedup
-- COMP-06: Physical mailing address required for sends

-- Add physical_address column to settings singleton
ALTER TABLE settings ADD COLUMN IF NOT EXISTS physical_address TEXT NOT NULL DEFAULT '';

-- Partitioned parent tables cannot support the original unique index shape here.
-- Maintain a supporting lookup index; application code now performs dedup safely.
CREATE INDEX IF NOT EXISTS idx_events_message_type_time
  ON events (message_id, event_type, event_time DESC)
  WHERE message_id IS NOT NULL AND event_type IN (5, 6, 7);
