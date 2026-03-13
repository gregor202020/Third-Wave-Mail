import { describe, it, expect, vi } from 'vitest';
import { shouldSkipSend } from '../../workers/src/workers/bulk-send.worker.js';

/**
 * Unit tests for bulk-send deduplication logic.
 *
 * Tests the shouldSkipSend helper which checks whether an email has already
 * been sent for a given campaign/contact pair. This prevents duplicate sends
 * when BullMQ retries a job that partially succeeded.
 *
 * No database is required — a mock db object is injected via the db parameter.
 */

function makeMockDb(executeTakeFirstResult: unknown) {
  const executeTakeFirst = vi.fn().mockResolvedValue(executeTakeFirstResult);
  const where2 = vi.fn().mockReturnValue({ executeTakeFirst });
  const where1 = vi.fn().mockReturnValue({ where: where2 });
  const select = vi.fn().mockReturnValue({ where: where1 });
  const selectFrom = vi.fn().mockReturnValue({ select });

  return { selectFrom } as unknown as any;
}

describe('shouldSkipSend', () => {
  it('returns false when no existing message record found for campaign+contact', async () => {
    const db = makeMockDb(undefined);

    const result = await shouldSkipSend(db, 10, 42);

    expect(result).toBe(false);
  });

  it('returns true when an existing message record exists for campaign+contact', async () => {
    const db = makeMockDb({ id: 'msg-uuid-123' });

    const result = await shouldSkipSend(db, 10, 42);

    expect(result).toBe(true);
  });

  it('queries the messages table with the correct campaign_id and contact_id', async () => {
    const executeTakeFirst = vi.fn().mockResolvedValue(undefined);
    const where2 = vi.fn().mockReturnValue({ executeTakeFirst });
    const where1 = vi.fn().mockReturnValue({ where: where2 });
    const select = vi.fn().mockReturnValue({ where: where1 });
    const selectFrom = vi.fn().mockReturnValue({ select });
    const db = { selectFrom } as unknown as any;

    await shouldSkipSend(db, 99, 77);

    expect(selectFrom).toHaveBeenCalledWith('messages');
    expect(where1).toHaveBeenCalledWith('campaign_id', '=', 99);
    expect(where2).toHaveBeenCalledWith('contact_id', '=', 77);
  });
});
