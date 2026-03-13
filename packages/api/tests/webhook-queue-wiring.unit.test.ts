import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit test: webhook queue wiring (OPS-02)
 *
 * Verifies that enqueueWebhookDelivery uses BullMQ Queue.add('deliver', jobData)
 * instead of redis.lpush on a raw list.
 *
 * Strategy: mock BullMQ Queue class and @twmail/shared to intercept calls,
 * then verify Queue.add is called with the correct arguments and redis.lpush
 * is never called.
 */

const mockQueueAdd = vi.fn().mockResolvedValue({ id: 'job-1' });
const mockQueueClose = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: mockQueueClose,
  })),
}));

const mockLpush = vi.fn();
const mockGetRedis = vi.fn().mockReturnValue({ lpush: mockLpush });
const mockGetDb = vi.fn();

vi.mock('@twmail/shared', () => ({
  getRedis: mockGetRedis,
  getDb: mockGetDb,
  ErrorCode: { NOT_FOUND: 'NOT_FOUND' },
  WebhookDeliveryStatus: { PENDING: 'pending', DELIVERED: 'delivered', FAILED: 'failed' },
}));

// Mock AppError
vi.mock('../src/plugins/error-handler.js', () => ({
  AppError: class AppError extends Error {
    constructor(
      public statusCode: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

describe('enqueueWebhookDelivery — BullMQ queue wiring (OPS-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up mock DB chain
    const mockDelivery = {
      id: 42,
      endpoint_id: 7,
      event_type: 'email.sent',
      payload: {},
      status: 'pending',
    };

    const executeTakeFirstOrThrow = vi.fn().mockResolvedValue(mockDelivery);
    const returningAll = vi.fn().mockReturnValue({ executeTakeFirstOrThrow });
    const values = vi.fn().mockReturnValue({ returningAll });
    const insertInto = vi.fn().mockReturnValue({ values });

    const executeResult = [
      {
        id: 7,
        url: 'https://example.com/hook',
        secret: 'test-secret',
        events: ['email.sent'],
        active: true,
        failure_count: 0,
      },
    ];
    const execute = vi.fn().mockResolvedValue(executeResult);
    const where = vi.fn().mockReturnValue({ execute });
    const selectAll = vi.fn().mockReturnValue({ where });
    const selectFrom = vi.fn().mockReturnValue({ selectAll });

    mockGetDb.mockReturnValue({ selectFrom, insertInto });
  });

  it('calls Queue.add with handler name "deliver" and correct job data shape', async () => {
    const { enqueueWebhookDelivery } = await import('../src/services/webhooks.service.js');

    await enqueueWebhookDelivery('email.sent', { messageId: 123 });

    expect(mockQueueAdd).toHaveBeenCalledOnce();
    const [handlerName, jobData] = mockQueueAdd.mock.calls[0]!;
    expect(handlerName).toBe('deliver');
    expect(jobData).toMatchObject({
      deliveryId: expect.any(Number),
      endpointId: expect.any(Number),
      url: expect.any(String),
      secret: expect.any(String),
      eventType: 'email.sent',
      payload: expect.objectContaining({ event: 'email.sent' }),
      attempt: 1,
    });
  });

  it('creates Queue named "webhook"', async () => {
    const { Queue } = await import('bullmq');
    const { enqueueWebhookDelivery } = await import('../src/services/webhooks.service.js');

    await enqueueWebhookDelivery('email.sent', { messageId: 123 });

    expect(Queue).toHaveBeenCalledWith('webhook', expect.objectContaining({ connection: expect.anything() }));
  });

  it('calls queue.close() after queue.add()', async () => {
    const { enqueueWebhookDelivery } = await import('../src/services/webhooks.service.js');

    await enqueueWebhookDelivery('email.sent', { messageId: 123 });

    expect(mockQueueClose).toHaveBeenCalledOnce();
  });

  it('does NOT call redis.lpush — raw list bypasses BullMQ', async () => {
    const { enqueueWebhookDelivery } = await import('../src/services/webhooks.service.js');

    await enqueueWebhookDelivery('email.sent', { messageId: 123 });

    expect(mockLpush).not.toHaveBeenCalled();
  });
});
