import { describe, it, expect, vi } from 'vitest';
import { processBounceSnsEvent } from '../src/routes/webhooks-inbound.js';

/**
 * Unit tests for SNS bounce event idempotency.
 *
 * Tests the processBounceSnsEvent helper which uses ON CONFLICT DO NOTHING to
 * prevent duplicate bounce/complaint events when the same SNS notification is
 * delivered more than once.
 *
 * No database is required — a mock db object is injected via the db parameter.
 */

function makeMockDb(executeTakeFirstResult: unknown) {
  const executeTakeFirst = vi.fn().mockResolvedValue(executeTakeFirstResult);
  const doNothing = vi.fn().mockReturnValue({ executeTakeFirst });
  const onConflict = vi.fn().mockReturnValue({ executeTakeFirst, doNothing });

  // onConflict receives a callback; the callback is called with an oc object
  // that has .columns().doNothing() chain
  const columnsChain = { doNothing };
  const ocBuilder = { column: vi.fn().mockReturnValue({ doNothing }), columns: vi.fn().mockReturnValue({ doNothing }) };
  const onConflictFn = vi.fn().mockImplementation((cb: (oc: typeof ocBuilder) => unknown) => {
    cb(ocBuilder);
    return { executeTakeFirst };
  });

  const values = vi.fn().mockReturnValue({ onConflict: onConflictFn });
  const insertInto = vi.fn().mockReturnValue({ values });

  return { insertInto } as unknown as any;
}

describe('processBounceSnsEvent', () => {
  it('first notification inserts successfully — returns inserted: true', async () => {
    const db = makeMockDb({ numInsertedOrUpdatedRows: 1n });

    const result = await processBounceSnsEvent(
      db,
      'sns-msg-001',
      'msg-uuid-001',
      42,
      10,
      null,
      'Permanent',
      {},
    );

    expect(result.inserted).toBe(true);
  });

  it('duplicate notification is deduplicated — returns inserted: false', async () => {
    const db = makeMockDb({ numInsertedOrUpdatedRows: 0n });

    const result = await processBounceSnsEvent(
      db,
      'sns-msg-001',
      'msg-uuid-001',
      42,
      10,
      null,
      'Permanent',
      {},
    );

    expect(result.inserted).toBe(false);
  });

  it('null result from DB is treated as not inserted — returns inserted: false', async () => {
    const db = makeMockDb(undefined);

    const result = await processBounceSnsEvent(
      db,
      'sns-msg-001',
      'msg-uuid-001',
      42,
      10,
      null,
      'Transient',
      {},
    );

    expect(result.inserted).toBe(false);
  });

  it('soft bounce (Transient) uses SOFT_BOUNCE event type', async () => {
    const insertIntoSpy = vi.fn();
    const executeTakeFirst = vi.fn().mockResolvedValue({ numInsertedOrUpdatedRows: 1n });
    const doNothing = vi.fn().mockReturnValue({ executeTakeFirst });
    const ocBuilder = { columns: vi.fn().mockReturnValue({ doNothing }) };
    const onConflictFn = vi.fn().mockImplementation((cb: (oc: typeof ocBuilder) => unknown) => {
      cb(ocBuilder);
      return { executeTakeFirst };
    });
    const values = vi.fn().mockReturnValue({ onConflict: onConflictFn });
    insertIntoSpy.mockReturnValue({ values });

    const db = { insertInto: insertIntoSpy } as unknown as any;

    await processBounceSnsEvent(db, 'sns-msg-002', 'msg-uuid-002', 1, 5, null, 'Transient', {});

    // Verify insertInto was called on 'events' table
    expect(insertIntoSpy).toHaveBeenCalledWith('events');
    // Verify values included event_type for soft bounce (6)
    const valuesArg = values.mock.calls[0]?.[0];
    expect(valuesArg?.event_type).toBe(6); // EventType.SOFT_BOUNCE = 6
  });

  it('hard bounce (Permanent) uses HARD_BOUNCE event type', async () => {
    const insertIntoSpy = vi.fn();
    const executeTakeFirst = vi.fn().mockResolvedValue({ numInsertedOrUpdatedRows: 1n });
    const doNothing = vi.fn().mockReturnValue({ executeTakeFirst });
    const ocBuilder = { columns: vi.fn().mockReturnValue({ doNothing }) };
    const onConflictFn = vi.fn().mockImplementation((cb: (oc: typeof ocBuilder) => unknown) => {
      cb(ocBuilder);
      return { executeTakeFirst };
    });
    const values = vi.fn().mockReturnValue({ onConflict: onConflictFn });
    insertIntoSpy.mockReturnValue({ values });

    const db = { insertInto: insertIntoSpy } as unknown as any;

    await processBounceSnsEvent(db, 'sns-msg-003', 'msg-uuid-003', 1, 5, null, 'Permanent', {});

    const valuesArg = values.mock.calls[0]?.[0];
    expect(valuesArg?.event_type).toBe(5); // EventType.HARD_BOUNCE = 5
  });
});
