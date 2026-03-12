---
phase: 01-critical-bug-fixes
plan: 02
status: complete
---

# Plan 01-02 Summary: Worker-Side Bug Fixes

## Changes Made

### bulk-send.worker.ts
- **BUG-02**: Added idempotency check (SELECT before INSERT) — duplicate sends on retry now skip gracefully
- **BUG-03**: Replaced Redis holdback storage with PostgreSQL INSERT into `campaign_holdback_contacts` (batched 500/insert)
- **BUG-04**: Replaced non-atomic `redis.decr` with Lua script `DECR_AND_CHECK_LUA` — exactly one worker triggers SENT transition
- **BUG-06**: Added resend queue trigger (`Queue('resend').add()`) in campaign completion path when `resend_enabled` is true
- Fixed Redis counter to use `testContacts.length` for A/B path (was incorrectly using `contactIds.length`)

### ab-eval.worker.ts
- **BUG-03**: Replaced `redis.get('twmail:ab-holdback:...')` with PostgreSQL SELECT from `campaign_holdback_contacts`
- Added cleanup DELETE after winner variant contacts are enqueued
- Removed all Redis holdback references

## Verification
- No `twmail:ab-holdback` references remain in either worker file
- `DECR_AND_CHECK_LUA` defined once, used in both dedup-skip and completion paths
- Resend trigger fires only when `resend_enabled && resend_config`
- Holdback uses batched inserts (500 per batch)
