import { getDb, ErrorCode } from '@twmail/shared';
import type { PaginationParams, PaginatedResponse, Template } from '@twmail/shared';
import { AppError } from '../plugins/error-handler.js';

export async function listTemplates(
  params: PaginationParams & { category?: string },
): Promise<PaginatedResponse<Template>> {
  const db = getDb();
  const page = params.page ?? 1;
  const perPage = Math.min(params.per_page ?? 50, 200);
  const offset = (page - 1) * perPage;

  let query = db.selectFrom('templates').selectAll();
  let countQuery = db.selectFrom('templates').select(db.fn.countAll<number>().as('count'));

  if (params.category) {
    query = query.where('category', '=', params.category);
    countQuery = countQuery.where('category', '=', params.category);
  }

  query = query.orderBy('created_at', 'desc').limit(perPage).offset(offset);

  const [templates, countResult] = await Promise.all([
    query.execute(),
    countQuery.executeTakeFirstOrThrow(),
  ]);

  const total = Number(countResult.count);

  return {
    data: templates,
    meta: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  };
}

export async function getTemplate(id: number): Promise<Template> {
  const db = getDb();

  const template = await db
    .selectFrom('templates')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  if (!template) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Template not found');
  }

  return template;
}

export async function createTemplate(data: {
  name: string;
  category?: string | null;
  content_html?: string | null;
  content_json?: Record<string, unknown>;
  thumbnail_url?: string | null;
  is_default?: boolean;
}): Promise<Template> {
  const db = getDb();

  return db
    .insertInto('templates')
    .values({
      name: data.name,
      category: data.category ?? null,
      content_html: data.content_html ?? null,
      content_json: data.content_json ?? {},
      thumbnail_url: data.thumbnail_url ?? null,
      is_default: data.is_default ?? false,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateTemplate(
  id: number,
  data: {
    name?: string;
    category?: string | null;
    content_html?: string | null;
    content_json?: Record<string, unknown>;
    thumbnail_url?: string | null;
    is_default?: boolean;
  },
): Promise<Template> {
  const db = getDb();

  const result = await db
    .updateTable('templates')
    .set(data)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Template not found');
  }

  return result;
}

export async function deleteTemplate(id: number): Promise<void> {
  const db = getDb();

  const result = await db
    .deleteFrom('templates')
    .where('id', '=', id)
    .executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Template not found');
  }
}

export async function cloneTemplate(id: number): Promise<Template> {
  const original = await getTemplate(id);
  const db = getDb();

  return db
    .insertInto('templates')
    .values({
      name: `${original.name} (Copy)`,
      category: original.category,
      content_html: original.content_html,
      content_json: original.content_json,
      thumbnail_url: original.thumbnail_url,
      is_default: false,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
