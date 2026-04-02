import { getDb, ErrorCode, SegmentType, ContactStatus } from '@twmail/shared';
import type {
  PaginationParams,
  PaginatedResponse,
  Segment,
  Contact,
  SegmentRule,
  SegmentRuleGroup,
} from '@twmail/shared';
import { sql, type ExpressionBuilder, type Expression, type SqlBool } from 'kysely';
import type { Database } from '@twmail/shared';
import { AppError } from '../plugins/error-handler.js';

export async function listSegments() {
  const db = getDb();
  return db.selectFrom('segments').selectAll().orderBy('created_at', 'desc').execute();
}

export async function getSegment(id: number): Promise<Segment> {
  const db = getDb();

  const segment = await db.selectFrom('segments').selectAll().where('id', '=', id).executeTakeFirst();

  if (!segment) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Segment not found');
  }

  return segment;
}

export async function createSegment(data: {
  name: string;
  type?: number;
  rules?: Record<string, unknown>;
  description?: string;
}): Promise<Segment> {
  const db = getDb();

  return db
    .insertInto('segments')
    .values({
      name: data.name,
      type: data.type ?? SegmentType.DYNAMIC,
      rules: data.rules ?? { groups: [] },
      description: data.description ?? '',
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateSegment(
  id: number,
  data: { name?: string; rules?: Record<string, unknown>; description?: string },
): Promise<Segment> {
  const db = getDb();

  const result = await db.updateTable('segments').set(data).where('id', '=', id).returningAll().executeTakeFirst();

  if (!result) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Segment not found');
  }

  return result;
}

export async function deleteSegment(id: number): Promise<void> {
  const db = getDb();

  const result = await db.deleteFrom('segments').where('id', '=', id).executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Segment not found');
  }
}

export async function getSegmentContacts(
  segmentId: number,
  params: PaginationParams,
): Promise<PaginatedResponse<Contact>> {
  const db = getDb();
  const page = params.page ?? 1;
  const perPage = Math.min(params.per_page ?? 50, 200);
  const offset = (page - 1) * perPage;

  const segment = await getSegment(segmentId);

  if (segment.type === SegmentType.STATIC) {
    return getStaticSegmentContacts(segmentId, page, perPage, offset);
  }

  // Dynamic segment: evaluate rules
  if (!segment.rules) {
    return { data: [], meta: { page, per_page: perPage, total: 0, total_pages: 0 } };
  }

  const ruleGroup = segment.rules as unknown as SegmentRuleGroup;

  let query = db.selectFrom('contacts').selectAll().where('status', '=', ContactStatus.ACTIVE);

  let countQuery = db
    .selectFrom('contacts')
    .select(db.fn.countAll<number>().as('count'))
    .where('status', '=', ContactStatus.ACTIVE);

  // Apply rules
  const ruleFilter = buildRuleFilter(ruleGroup);
  query = query.where(ruleFilter);
  countQuery = countQuery.where(ruleFilter);

  query = query.orderBy('created_at', 'desc').limit(perPage).offset(offset);

  const [contacts, countResult] = await Promise.all([query.execute(), countQuery.executeTakeFirstOrThrow()]);

  const total = Number(countResult.count);

  // Update cache
  db.updateTable('segments')
    .set({ cached_count: total })
    .where('id', '=', segmentId)
    .execute()
    .catch((err: unknown) => {
      console.warn('Failed to update segment contacts cache', { err, segmentId });
    });

  return {
    data: contacts,
    meta: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  };
}

async function getStaticSegmentContacts(
  segmentId: number,
  page: number,
  perPage: number,
  offset: number,
): Promise<PaginatedResponse<Contact>> {
  const db = getDb();

  const [contacts, countResult] = await Promise.all([
    db
      .selectFrom('contacts')
      .innerJoin('contact_segments', 'contact_segments.contact_id', 'contacts.id')
      .selectAll('contacts')
      .where('contact_segments.segment_id', '=', segmentId)
      .orderBy('contacts.created_at', 'desc')
      .limit(perPage)
      .offset(offset)
      .execute(),
    db
      .selectFrom('contact_segments')
      .select(db.fn.countAll<number>().as('count'))
      .where('segment_id', '=', segmentId)
      .executeTakeFirstOrThrow(),
  ]);

  const total = Number(countResult.count);

  return {
    data: contacts,
    meta: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  };
}

export async function getSegmentCount(segmentId: number): Promise<{ count: number }> {
  const db = getDb();
  const segment = await getSegment(segmentId);

  if (segment.type === SegmentType.STATIC) {
    const result = await db
      .selectFrom('contact_segments')
      .select(db.fn.countAll<number>().as('count'))
      .where('segment_id', '=', segmentId)
      .executeTakeFirstOrThrow();
    return { count: Number(result.count) };
  }

  if (!segment.rules) {
    return { count: 0 };
  }

  const ruleGroup = segment.rules as unknown as SegmentRuleGroup;
  const result = await db
    .selectFrom('contacts')
    .select(db.fn.countAll<number>().as('count'))
    .where('status', '=', ContactStatus.ACTIVE)
    .where(buildRuleFilter(ruleGroup))
    .executeTakeFirstOrThrow();

  const count = Number(result.count);

  // Update cache
  db.updateTable('segments')
    .set({ cached_count: count })
    .where('id', '=', segmentId)
    .execute()
    .catch((err: unknown) => {
      console.warn('Failed to update segment count cache', { err, segmentId });
    });

  return { count };
}

export async function addContactsToSegment(segmentId: number, contactIds: number[]): Promise<{ added: number }> {
  const db = getDb();
  const segment = await getSegment(segmentId);

  if (segment.type !== SegmentType.STATIC) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Can only add contacts to static segments');
  }

  let added = 0;
  for (const contactId of contactIds) {
    try {
      await db
        .insertInto('contact_segments')
        .values({ contact_id: contactId, segment_id: segmentId })
        .onConflict((oc) => oc.columns(['contact_id', 'segment_id']).doNothing())
        .execute();
      added++;
    } catch {
      // Skip invalid contact IDs
    }
  }

  return { added };
}

export async function removeContactFromSegment(segmentId: number, contactId: number): Promise<void> {
  const db = getDb();
  const segment = await getSegment(segmentId);

  if (segment.type !== SegmentType.STATIC) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Can only remove contacts from static segments');
  }

  const result = await db
    .deleteFrom('contact_segments')
    .where('segment_id', '=', segmentId)
    .where('contact_id', '=', contactId)
    .executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Contact not in this segment');
  }
}

// ============================================================================
// resolveSegmentContactIds — used by both API preview and send worker
//
// For STATIC segments: queries the contact_segments pivot table.
// For DYNAMIC segments: evaluates rules via buildRuleFilter.
// Both paths filter to ContactStatus.ACTIVE contacts only.
// ============================================================================

export async function resolveSegmentContactIds(segmentId: number): Promise<number[]> {
  const db = getDb();
  const segment = await getSegment(segmentId);

  if (segment.type === SegmentType.STATIC) {
    const rows = await db
      .selectFrom('contact_segments')
      .innerJoin('contacts', 'contacts.id', 'contact_segments.contact_id')
      .select('contacts.id')
      .where('contact_segments.segment_id', '=', segmentId)
      .where('contacts.status', '=', ContactStatus.ACTIVE)
      .execute();
    return rows.map((r) => r.id);
  }

  // Dynamic segment: evaluate rules on demand
  if (!segment.rules) return [];
  const ruleGroup = segment.rules as unknown as SegmentRuleGroup;
  const rows = await db
    .selectFrom('contacts')
    .select('id')
    .where('status', '=', ContactStatus.ACTIVE)
    .where(buildRuleFilter(ruleGroup))
    .execute();
  return rows.map((r) => r.id);
}

// ============================================================================
// Rule engine — builds Kysely WHERE clauses from segment rules
// ============================================================================

// Contact table columns that can be filtered on
const ALLOWED_COLUMNS = new Set([
  'email',
  'status',
  'first_name',
  'last_name',
  'phone',
  'company',
  'city',
  'country',
  'timezone',
  'source',
  'engagement_score',
  'engagement_tier',
  'last_open_at',
  'last_click_at',
  'last_activity_at',
  'subscribed_at',
  'unsubscribed_at',
  'created_at',
  'updated_at',
]);

function buildRuleFilter(
  group: SegmentRuleGroup,
): (eb: ExpressionBuilder<Database, 'contacts'>) => Expression<SqlBool> {
  return (eb: ExpressionBuilder<Database, 'contacts'>) => {
    const conditions = group.rules.map((rule) => {
      if (isSegmentRuleGroup(rule)) {
        // Nested group — accept both legacy `logic` and canonical `conjunction`.
        return buildRuleFilter(rule)(eb);
      }
      return buildSingleRule(eb, rule);
    });

    if (conditions.length === 0) {
      return eb.val(true);
    }

    if (getRuleGroupConjunction(group) === 'or') {
      return eb.or(conditions);
    }
    return eb.and(conditions);
  };
}

function buildSingleRule(eb: ExpressionBuilder<Database, 'contacts'>, rule: SegmentRule): Expression<SqlBool> {
  const { field, operator, value } = rule;

  // Handle custom_fields with jsonb path
  if (field.startsWith('custom_fields.')) {
    const jsonPath = field.replace('custom_fields.', '');
    return buildJsonbRule(jsonPath, operator, value);
  }

  // Validate column name
  if (!ALLOWED_COLUMNS.has(field)) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, `Invalid segment rule field: ${field}`);
  }

  // Use sql template for all comparisons to avoid Kysely's heterogeneous column
  // type-inference limitation (col is keyof Database['contacts'] — a union of all
  // column names — so Kysely cannot narrow the expected value type at compile time).
  const colRef = sql.ref(field);

  switch (operator) {
    case 'eq':
      return sql<SqlBool>`${colRef} = ${sql.val(value)}`;
    case 'neq':
      return sql<SqlBool>`${colRef} != ${sql.val(value)}`;
    case 'gt':
      return sql<SqlBool>`${colRef} > ${sql.val(value)}`;
    case 'gte':
      return sql<SqlBool>`${colRef} >= ${sql.val(value)}`;
    case 'lt':
      return sql<SqlBool>`${colRef} < ${sql.val(value)}`;
    case 'lte':
      return sql<SqlBool>`${colRef} <= ${sql.val(value)}`;
    case 'contains':
      return sql<SqlBool>`${colRef} ILIKE ${sql.val(`%${String(value)}%`)}`;
    case 'not_contains':
      return sql<SqlBool>`${colRef} NOT ILIKE ${sql.val(`%${String(value)}%`)}`;
    case 'starts_with':
      return sql<SqlBool>`${colRef} ILIKE ${sql.val(`${String(value)}%`)}`;
    case 'ends_with':
      return sql<SqlBool>`${colRef} ILIKE ${sql.val(`%${String(value)}`)}`;
    case 'is_set':
      return sql<SqlBool>`${colRef} IS NOT NULL`;
    case 'is_not_set':
      return sql<SqlBool>`${colRef} IS NULL`;
    case 'in': {
      const inValues = value as (string | number)[];
      return eb(field as keyof Database['contacts'], 'in', inValues as unknown as string[]);
    }
    case 'not_in': {
      const notInValues = value as (string | number)[];
      return eb.not(eb(field as keyof Database['contacts'], 'in', notInValues as unknown as string[]));
    }
    case 'before':
      return sql<SqlBool>`${colRef} < ${sql.val(new Date(value as string))}`;
    case 'after':
      return sql<SqlBool>`${colRef} > ${sql.val(new Date(value as string))}`;
    case 'between': {
      const [low, high] = value as [string | number, string | number];
      return sql<SqlBool>`${colRef} >= ${sql.val(low)} AND ${colRef} <= ${sql.val(high)}`;
    }
    case 'within_days': {
      // "within last N days" means column >= (now - N * 86400000ms)
      const days = Number(value);
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      return sql<SqlBool>`${colRef} >= ${sql.val(cutoff)}`;
    }
    default:
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, `Unsupported operator: ${String(operator)}`);
  }
}

function buildJsonbRule(path: string, operator: string, value: unknown): Expression<SqlBool> {
  switch (operator) {
    case 'eq':
      return sql<SqlBool>`custom_fields->>${sql.lit(path)} = ${sql.lit(String(value))}`;
    case 'neq':
      return sql<SqlBool>`custom_fields->>${sql.lit(path)} != ${sql.lit(String(value))}`;
    case 'contains':
      return sql<SqlBool>`custom_fields->>${sql.lit(path)} ILIKE ${'%' + String(value) + '%'}`;
    case 'is_set':
      return sql<SqlBool>`custom_fields ? ${sql.lit(path)}`;
    case 'is_not_set':
      return sql<SqlBool>`NOT (custom_fields ? ${sql.lit(path)})`;
    default:
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, `Unsupported operator for custom field: ${operator}`);
  }
}

function isSegmentRuleGroup(rule: SegmentRule | SegmentRuleGroup): rule is SegmentRuleGroup {
  return 'rules' in rule && Array.isArray(rule.rules);
}

function getRuleGroupConjunction(group: SegmentRuleGroup): 'and' | 'or' {
  const withLegacyLogic = group as SegmentRuleGroup & { logic?: 'and' | 'or' };
  return withLegacyLogic.conjunction ?? withLegacyLogic.logic ?? 'and';
}
