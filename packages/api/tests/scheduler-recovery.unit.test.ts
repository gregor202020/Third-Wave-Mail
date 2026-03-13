/**
 * Unit test: SENDING stall recovery in scheduler.ts
 *
 * Source-code scan approach — verifies the scheduler contains the correct
 * logic for detecting and re-enqueuing campaigns stuck in SENDING.
 * No DB or BullMQ connection required.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STALE_SENDING_THRESHOLD_MS } from '@twmail/workers/scheduler';

const schedulerSource = readFileSync(
  resolve(__dirname, '../../workers/src/scheduler.ts'),
  'utf-8',
);

describe('Scheduler SENDING stall recovery', () => {
  it('exports STALE_SENDING_THRESHOLD_MS constant equal to 10 minutes (600000 ms)', () => {
    expect(STALE_SENDING_THRESHOLD_MS).toBe(600_000);
  });

  it('source contains CampaignStatus.SENDING check', () => {
    expect(schedulerSource).toContain('CampaignStatus.SENDING');
  });

  it('source contains send_started_at comparison', () => {
    expect(schedulerSource).toContain('send_started_at');
  });

  it('source contains STALE_SENDING_THRESHOLD_MS constant declaration', () => {
    expect(schedulerSource).toContain('STALE_SENDING_THRESHOLD_MS');
  });

  it('source re-enqueues stuck campaigns via campaignSendQueue.add', () => {
    // Must contain the re-enqueue call for stuck campaigns after the SENDING check
    expect(schedulerSource).toContain("campaignSendQueue.add('send', { campaignId: campaign.id })");
  });

  it('source does NOT update campaign status when re-enqueuing stuck campaigns', () => {
    // The stall recovery block must NOT set status to any value for stuck campaigns.
    // We verify by checking that the only updateTable call in the file transitions
    // SCHEDULED -> SENDING (not SENDING -> anything else).
    const updateMatches = [...schedulerSource.matchAll(/updateTable/g)];
    // Only one updateTable call should exist (the SCHEDULED -> SENDING transition)
    expect(updateMatches.length).toBe(1);
    // That one update sets status to SENDING (transition from SCHEDULED)
    expect(schedulerSource).toContain('CampaignStatus.SENDING, send_started_at');
  });
});
