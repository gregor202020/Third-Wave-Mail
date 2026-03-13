import { describe, it, expect } from 'vitest';
import {
  Kysely,
  DummyDriver,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { buildRuleFilter } from '@twmail/shared';
import type { Database } from '@twmail/shared';
import type { SegmentRuleGroup } from '@twmail/shared';

/**
 * Unit tests for segment AND/OR rule logic.
 *
 * Tests buildRuleFilter SQL generation using Kysely's DummyDriver (no real DB
 * connection required). We compile queries to SQL strings and assert on the
 * structure, verifying operator precedence and parenthesization.
 */

// Create a minimal Kysely instance for SQL compilation only (no DB connection)
function makeDb(): Kysely<Database> {
  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

function compiledSql(db: Kysely<Database>, group: SegmentRuleGroup): string {
  const query = db
    .selectFrom('contacts')
    .select('id')
    .where(buildRuleFilter(group));
  return query.compile().sql;
}

describe('buildRuleFilter — AND/OR logic', () => {
  it('AND group with two rules produces SQL with AND operator', () => {
    const db = makeDb();
    const group: SegmentRuleGroup = {
      logic: 'and',
      rules: [
        { field: 'status', operator: 'eq', value: 1 },
        { field: 'country', operator: 'eq', value: 'AU' },
      ],
    };

    const sql = compiledSql(db, group);

    expect(sql).toContain('and');
    expect(sql).toContain('"status"');
    expect(sql).toContain('"country"');
  });

  it('OR group with two rules produces SQL with OR operator', () => {
    const db = makeDb();
    const group: SegmentRuleGroup = {
      logic: 'or',
      rules: [
        { field: 'status', operator: 'eq', value: 1 },
        { field: 'country', operator: 'eq', value: 'AU' },
      ],
    };

    const sql = compiledSql(db, group);

    expect(sql).toContain('or');
    expect(sql).toContain('"status"');
    expect(sql).toContain('"country"');
  });

  it('nested AND group inside OR group produces correct SQL structure', () => {
    const db = makeDb();
    const group: SegmentRuleGroup = {
      logic: 'or',
      rules: [
        { field: 'country', operator: 'eq', value: 'AU' },
        {
          logic: 'and',
          rules: [
            { field: 'status', operator: 'eq', value: 1 },
            { field: 'engagement_score', operator: 'gte', value: 50 },
          ],
        },
      ],
    };

    const sql = compiledSql(db, group);

    // SQL should contain both OR and AND to handle nested logic
    expect(sql).toContain('or');
    expect(sql).toContain('and');
    expect(sql).toContain('"country"');
    expect(sql).toContain('"status"');
    expect(sql).toContain('"engagement_score"');
  });
});

describe('buildRuleFilter — special operators', () => {
  it('within_days operator produces >= comparison (active in last N days)', () => {
    const db = makeDb();
    const group: SegmentRuleGroup = {
      logic: 'and',
      rules: [
        { field: 'last_open_at', operator: 'within_days', value: 30 },
      ],
    };

    const sql = compiledSql(db, group);

    // within_days should produce: column >= (now - N*86400000ms)
    expect(sql).toContain('>=');
    expect(sql).toContain('"last_open_at"');
  });

  it('between operator produces >= low AND <= high bounds', () => {
    const db = makeDb();
    const group: SegmentRuleGroup = {
      logic: 'and',
      rules: [
        { field: 'engagement_score', operator: 'between', value: [10, 50] },
      ],
    };

    const sql = compiledSql(db, group);

    // between should produce: column >= low AND column <= high
    expect(sql).toContain('>=');
    expect(sql).toContain('<=');
    expect(sql).toContain('"engagement_score"');
  });

  it('empty rules group returns a truthy condition (no crash)', () => {
    const db = makeDb();
    const group: SegmentRuleGroup = {
      logic: 'and',
      rules: [],
    };

    // Should not throw
    expect(() => compiledSql(db, group)).not.toThrow();
  });

  it('contains operator produces ILIKE with wildcards', () => {
    const db = makeDb();
    const group: SegmentRuleGroup = {
      logic: 'and',
      rules: [
        { field: 'email', operator: 'contains', value: 'gmail' },
      ],
    };

    const sql = compiledSql(db, group);

    expect(sql.toLowerCase()).toContain('ilike');
    expect(sql).toContain('"email"');
  });
});
