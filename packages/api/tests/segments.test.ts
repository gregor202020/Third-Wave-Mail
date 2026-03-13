import { describe, it, expect, afterAll } from 'vitest';
import { getApp, closeApp, loginAsAdmin, authHeader } from './setup.js';

afterAll(async () => {
  await closeApp();
});

describe('Segment Routes', () => {
  let token: string;
  let createdSegmentId: number;

  it('should authenticate before tests', async () => {
    const app = await getApp();
    token = await loginAsAdmin(app);
  });

  it('POST /api/segments creates a dynamic segment', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/segments',
      headers: authHeader(token),
      payload: {
        name: 'Active Melbourne Users',
        type: 1,
        rules: {
          logic: 'and',
          rules: [
            { field: 'city', operator: 'eq', value: 'Melbourne' },
            { field: 'status', operator: 'eq', value: 1 },
          ],
        },
        description: 'All active contacts in Melbourne',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.data.name).toBe('Active Melbourne Users');
    createdSegmentId = body.data.id;
  });

  it('GET /api/segments returns segments', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/segments',
      headers: authHeader(token),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toBeInstanceOf(Array);
  });

  it('GET /api/segments/:id/count returns count', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'GET',
      url: `/api/segments/${createdSegmentId}/count`,
      headers: authHeader(token),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(typeof body.data.count).toBe('number');
  });

  it('DELETE /api/segments/:id deletes a segment', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/segments/${createdSegmentId}`,
      headers: authHeader(token),
    });

    expect(response.statusCode).toBe(204);
  });
});

// ----------------------------------------------------------------------------
// DATA-10: Missing operator tests (before, after, between, within_days)
// These tests verify that each operator evaluates without throwing
// "Unsupported operator" and returns a valid numeric count.
// ----------------------------------------------------------------------------

describe('Segment rule operators — DATA-10', () => {
  let token: string;
  const segmentIds: number[] = [];

  it('should authenticate before operator tests', async () => {
    const app = await getApp();
    token = await loginAsAdmin(app);
  });

  // Test 1: `before` operator — column < date comparison
  it('Test 1: before operator produces column < date comparison (returns 200 with numeric count)', async () => {
    const app = await getApp();

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/segments',
      headers: authHeader(token),
      payload: {
        name: '__test_before_operator',
        type: 1,
        rules: {
          logic: 'and',
          rules: [
            { field: 'created_at', operator: 'before', value: '2030-01-01T00:00:00.000Z' },
          ],
        },
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    segmentIds.push(created.data.id);

    const countRes = await app.inject({
      method: 'GET',
      url: `/api/segments/${created.data.id}/count`,
      headers: authHeader(token),
    });

    expect(countRes.statusCode).toBe(200);
    const body = JSON.parse(countRes.body);
    expect(typeof body.data.count).toBe('number');
  });

  // Test 2: `after` operator — column > date comparison
  it('Test 2: after operator produces column > date comparison (returns 200 with numeric count)', async () => {
    const app = await getApp();

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/segments',
      headers: authHeader(token),
      payload: {
        name: '__test_after_operator',
        type: 1,
        rules: {
          logic: 'and',
          rules: [
            { field: 'created_at', operator: 'after', value: '2020-01-01T00:00:00.000Z' },
          ],
        },
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    segmentIds.push(created.data.id);

    const countRes = await app.inject({
      method: 'GET',
      url: `/api/segments/${created.data.id}/count`,
      headers: authHeader(token),
    });

    expect(countRes.statusCode).toBe(200);
    const body = JSON.parse(countRes.body);
    expect(typeof body.data.count).toBe('number');
  });

  // Test 3: `between` operator — column >= low AND column <= high
  it('Test 3: between operator with [low, high] array produces column >= low AND column <= high (returns 200)', async () => {
    const app = await getApp();

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/segments',
      headers: authHeader(token),
      payload: {
        name: '__test_between_operator',
        type: 1,
        rules: {
          logic: 'and',
          rules: [
            { field: 'engagement_score', operator: 'between', value: [0, 100] },
          ],
        },
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    segmentIds.push(created.data.id);

    const countRes = await app.inject({
      method: 'GET',
      url: `/api/segments/${created.data.id}/count`,
      headers: authHeader(token),
    });

    expect(countRes.statusCode).toBe(200);
    const body = JSON.parse(countRes.body);
    expect(typeof body.data.count).toBe('number');
  });

  // Test 4: `within_days` operator — column >= (now - N days)
  it('Test 4: within_days operator with value=7 produces column >= (now - 7 days) (returns 200)', async () => {
    const app = await getApp();

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/segments',
      headers: authHeader(token),
      payload: {
        name: '__test_within_days_operator',
        type: 1,
        rules: {
          logic: 'and',
          rules: [
            // within_days: contacts whose last_activity_at is within the last 7 days
            { field: 'last_activity_at', operator: 'within_days', value: 7 },
          ],
        },
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    segmentIds.push(created.data.id);

    const countRes = await app.inject({
      method: 'GET',
      url: `/api/segments/${created.data.id}/count`,
      headers: authHeader(token),
    });

    expect(countRes.statusCode).toBe(200);
    const body = JSON.parse(countRes.body);
    expect(typeof body.data.count).toBe('number');
  });

  // Test 5: Mixed AND/OR rules with date operators produce correct results
  it('Test 5: Mixed AND/OR rules with date operators evaluate without error', async () => {
    const app = await getApp();

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/segments',
      headers: authHeader(token),
      payload: {
        name: '__test_mixed_date_operators',
        type: 1,
        rules: {
          logic: 'or',
          rules: [
            {
              logic: 'and',
              rules: [
                { field: 'created_at', operator: 'after', value: '2020-01-01T00:00:00.000Z' },
                { field: 'last_activity_at', operator: 'within_days', value: 30 },
              ],
            },
            {
              logic: 'and',
              rules: [
                { field: 'created_at', operator: 'before', value: '2030-01-01T00:00:00.000Z' },
                { field: 'engagement_score', operator: 'between', value: [50, 100] },
              ],
            },
          ],
        },
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    segmentIds.push(created.data.id);

    const countRes = await app.inject({
      method: 'GET',
      url: `/api/segments/${created.data.id}/count`,
      headers: authHeader(token),
    });

    expect(countRes.statusCode).toBe(200);
    const body = JSON.parse(countRes.body);
    expect(typeof body.data.count).toBe('number');
  });

  // Test 6: `between` with date values (e.g., created_at between two dates)
  it('Test 6: between with date string values works correctly (returns 200)', async () => {
    const app = await getApp();

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/segments',
      headers: authHeader(token),
      payload: {
        name: '__test_between_dates',
        type: 1,
        rules: {
          logic: 'and',
          rules: [
            {
              field: 'created_at',
              operator: 'between',
              value: ['2020-01-01T00:00:00.000Z', '2030-12-31T23:59:59.000Z'],
            },
          ],
        },
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    segmentIds.push(created.data.id);

    const countRes = await app.inject({
      method: 'GET',
      url: `/api/segments/${created.data.id}/count`,
      headers: authHeader(token),
    });

    expect(countRes.statusCode).toBe(200);
    const body = JSON.parse(countRes.body);
    expect(typeof body.data.count).toBe('number');
  });

  // Cleanup all test segments
  it('should clean up test segments', async () => {
    const app = await getApp();
    for (const id of segmentIds) {
      await app.inject({
        method: 'DELETE',
        url: `/api/segments/${id}`,
        headers: authHeader(token),
      });
    }
  });
});
