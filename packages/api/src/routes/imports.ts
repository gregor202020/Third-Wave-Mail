import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse as csvParseSync } from 'csv-parse/sync';
import { getDb, getRedis, ErrorCode, ImportType, ImportStatus } from '@twmail/shared';
import { Queue, type ConnectionOptions } from 'bullmq';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../plugins/error-handler.js';

const pasteSchema = z.object({
  text: z.string().min(1),
  list_id: z.number().optional(),
  new_list_name: z.string().min(1).max(200).optional(),
  update_existing: z.boolean().optional(),
});

const mappingPresetSchema = z.object({
  name: z.string().min(1).max(100),
  mapping: z.record(z.string()),
});

// Auto-detection mappings for common column names
const AUTO_FIELD_MAP: Record<string, string> = {
  email: 'email',
  'e-mail': 'email',
  email_address: 'email',
  emailaddress: 'email',
  first_name: 'first_name',
  firstname: 'first_name',
  first: 'first_name',
  given_name: 'first_name',
  last_name: 'last_name',
  lastname: 'last_name',
  last: 'last_name',
  surname: 'last_name',
  family_name: 'last_name',
  phone: 'phone',
  telephone: 'phone',
  mobile: 'phone',
  mobilenumber: 'phone',
  mobile_number: 'phone',
  phonenumber: 'phone',
  phone_number: 'phone',
  cell: 'phone',
  cellphone: 'phone',
  company: 'company',
  organization: 'company',
  org: 'company',
  city: 'city',
  town: 'city',
  country: 'country',
};

function autoDetectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const normalized = header.toLowerCase().replace(/[^a-z_]/g, '');
    mapping[header] = AUTO_FIELD_MAP[normalized] ?? `custom.${header}`;
  }
  return mapping;
}

function parseUserMappingJson(value: string): Record<string, string> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    const result = mappingPresetSchema.shape.mapping.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Smart column detection: scan cell values to determine what each column contains.
 * Falls back to header-based detection when headers match known names.
 */
function smartDetectMapping(
  headers: string[],
  dataRows: Array<Record<string, string>>,
): Record<string, string> {
  // First try header-based mapping
  const headerMapping = autoDetectMapping(headers);
  const hasKnownHeaders = Object.values(headerMapping).some(
    (v) => !v.startsWith('custom.'),
  );

  // If headers matched known names, use that
  if (hasKnownHeaders) {
    return headerMapping;
  }

  // Otherwise, scan data rows to detect column types
  const sampleRows = dataRows.slice(0, 10);
  if (sampleRows.length === 0) return headerMapping;

  const mapping: Record<string, string> = {};
  const emailPattern = /@.*\./;
  const phonePattern = /^[\d\s\-+().]{7,20}$/;

  // Score each column
  const columnScores: Record<
    string,
    { email: number; phone: number; text: number; total: number }
  > = {};

  for (const header of headers) {
    columnScores[header] = { email: 0, phone: 0, text: 0, total: 0 };
  }

  for (const row of sampleRows) {
    for (const header of headers) {
      const value = (row[header] ?? '').trim();
      if (!value) continue;
      const scores = columnScores[header]!;
      scores.total++;

      if (emailPattern.test(value)) {
        scores.email++;
      } else if (phonePattern.test(value)) {
        scores.phone++;
      } else if (value.length >= 1 && value.length <= 40 && !/\d/.test(value)) {
        scores.text++;
      }
    }
  }

  // Assign types based on scores
  let emailAssigned = false;
  let phoneAssigned = false;
  const textColumns: string[] = [];

  // First pass: find email column (highest email ratio)
  let bestEmailCol = '';
  let bestEmailRatio = 0;
  for (const header of headers) {
    const scores = columnScores[header]!;
    if (scores.total === 0) continue;
    const ratio = scores.email / scores.total;
    if (ratio > bestEmailRatio && ratio >= 0.5) {
      bestEmailRatio = ratio;
      bestEmailCol = header;
    }
  }

  if (bestEmailCol) {
    mapping[bestEmailCol] = 'email';
    emailAssigned = true;
  }

  // Second pass: assign other columns
  for (const header of headers) {
    if (mapping[header]) continue;
    const scores = columnScores[header]!;
    if (scores.total === 0) {
      mapping[header] = `custom.${header}`;
      continue;
    }

    const phoneRatio = scores.phone / scores.total;
    const textRatio = scores.text / scores.total;

    if (!phoneAssigned && phoneRatio >= 0.5) {
      mapping[header] = 'phone';
      phoneAssigned = true;
    } else if (textRatio >= 0.5) {
      textColumns.push(header);
    } else {
      mapping[header] = `custom.${header}`;
    }
  }

  // Assign text columns as first_name and last_name
  if (textColumns.length >= 1) {
    mapping[textColumns[0]!] = 'first_name';
  }
  if (textColumns.length >= 2) {
    mapping[textColumns[1]!] = 'last_name';
  }
  for (let i = 2; i < textColumns.length; i++) {
    mapping[textColumns[i]!] = `custom.${textColumns[i]}`;
  }

  // If no email column was detected, check if headers look like data (no header row)
  if (!emailAssigned) {
    // Still assign what we can, caller should check for email
    for (const header of headers) {
      if (!mapping[header]) {
        mapping[header] = `custom.${header}`;
      }
    }
  }

  return mapping;
}

/**
 * Check if the first row looks like headers or data.
 * If the first row contains an @ sign, it's likely data, not headers.
 */
function firstRowIsHeader(values: string[]): boolean {
  // If any value in the first row looks like an email, it's data
  for (const v of values) {
    if (/@.*\./.test(v.trim())) return false;
  }
  // If any value matches a known header name, it's headers
  for (const v of values) {
    const normalized = v.trim().toLowerCase().replace(/[^a-z_]/g, '');
    if (AUTO_FIELD_MAP[normalized]) return true;
  }
  // Default: treat as headers if values are short and don't contain digits
  return values.every(
    (v) => v.trim().length <= 30 && !/\d/.test(v.trim()),
  );
}

function parsePastedText(text: string): Array<Record<string, string>> {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const firstLine = lines[0]!;
  let delimiter: string;

  if (firstLine.includes('\t')) {
    delimiter = '\t';
  } else if (firstLine.includes(',')) {
    delimiter = ',';
  } else {
    // One email per line
    return lines.map((line) => ({ email: line.trim() }));
  }

  const firstValues = firstLine.split(delimiter).map((h) => h.trim());
  const isHeader = firstRowIsHeader(firstValues);

  if (isHeader) {
    const headers = firstValues.map((h) => h.toLowerCase());
    return lines.slice(1).map((line) => {
      const values = line.split(delimiter);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = (values[i] ?? '').trim();
      });
      return row;
    });
  } else {
    // No header row - use generic column names
    const headers = firstValues.map((_, i) => `column_${i + 1}`);
    return lines.map((line) => {
      const values = line.split(delimiter);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = (values[i] ?? '').trim();
      });
      return row;
    });
  }
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);

  return result;
}

function parseCsv(content: string): Array<Record<string, string>> {
  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Detect delimiter from first line
  const firstLine = normalized.split('\n')[0] ?? '';
  let delimiter = ',';
  if (firstLine.includes('\t')) delimiter = '\t';
  else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';
  else if (firstLine.includes('|') && !firstLine.includes(',')) delimiter = '|';

  // Use csv-parse which handles multi-line quoted fields, escapes, etc.
  const records = csvParseSync(normalized, {
    delimiter,
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  }) as string[][];

  if (records.length < 1) return [];

  const firstRow = records[0]!;
  const isHeader = firstRowIsHeader(firstRow);

  if (isHeader) {
    const headers = firstRow.map((h) => h.toLowerCase().trim());
    return records.slice(1).map((values) => {
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = (values[i] ?? '').trim();
      });
      return row;
    });
  } else {
    const headers = firstRow.map((_, i) => `column_${i + 1}`);
    return records.map((values) => {
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = (values[i] ?? '').trim();
      });
      return row;
    });
  }
}

/**
 * Resolve list_id: if new_list_name is provided, create a new list and return its ID.
 * Otherwise return the provided list_id (or undefined).
 */
async function resolveListId(
  listId: number | undefined,
  newListName: string | undefined,
): Promise<number | undefined> {
  if (newListName) {
    const db = getDb();
    const newList = await db
      .insertInto('lists')
      .values({ name: newListName })
      .returningAll()
      .executeTakeFirstOrThrow();
    return newList.id;
  }
  return listId;
}

export const importRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // POST /api/contacts/import/paste
  app.post('/paste', async (request, reply) => {
    const body = pasteSchema.parse(request.body);
    const db = getDb();
    const redis = getRedis();

    const rows = parsePastedText(body.text);
    if (rows.length === 0) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'No valid data found in pasted text');
    }

    const headers = Object.keys(rows[0]!);
    const mapping = smartDetectMapping(headers, rows);

    // Ensure email column is detected
    if (!Object.values(mapping).includes('email')) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Could not detect an email column. Please ensure your data contains email addresses.',
      );
    }

    const listId = await resolveListId(body.list_id, body.new_list_name);

    // Create import record
    const imp = await db
      .insertInto('imports')
      .values({
        type: ImportType.PASTE,
        status: ImportStatus.PROCESSING,
        total_rows: rows.length,
        mapping_config: mapping,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Enqueue for worker via BullMQ
    const importQueue = new Queue('import', { connection: redis as unknown as ConnectionOptions });
    await importQueue.add('process', {
      importId: imp.id,
      data: body.text,
      type: 'paste' as const,
      mapping,
      updateExisting: body.update_existing ?? true,
      listId,
    });
    await importQueue.close();

    return reply.status(202).send({ data: imp });
  });

  // POST /api/contacts/import/csv (multipart file upload)
  app.post('/csv', async (request, reply) => {
    const db = getDb();
    const redis = getRedis();

    let file;
    try {
      file = await request.file();
    } catch (err) {
      request.log.error({ err }, 'Failed to read multipart file');
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Failed to read uploaded file');
    }
    if (!file) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'No file uploaded');
    }

    // Read file content
    const buffer = await file.toBuffer();
    const csvContent = buffer.toString('utf-8');
    request.log.info({ fileSize: buffer.length, csvLength: csvContent.length, filename: file.filename }, 'CSV file received');

    // Parse additional form fields
    const fields = file.fields;
    let listId: number | undefined;
    let newListName: string | undefined;
    let updateExisting = true;
    let userMapping: Record<string, string> | undefined;

    if (fields['list_id'] && 'value' in fields['list_id']) {
      const val = Number(fields['list_id'].value);
      if (!isNaN(val)) listId = val;
    }
    if (fields['new_list_name'] && 'value' in fields['new_list_name']) {
      const val = (fields['new_list_name'] as { value: string }).value;
      if (val) newListName = val;
    }
    if (fields['update_existing'] && 'value' in fields['update_existing']) {
      updateExisting = fields['update_existing'].value !== 'false';
    }
    if (fields['mapping'] && 'value' in fields['mapping']) {
      userMapping = parseUserMappingJson((fields['mapping'] as { value: string }).value);
    }

    const rows = parseCsv(csvContent);
    request.log.info({ parsedRows: rows.length }, 'CSV parsed');
    if (rows.length === 0) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'No valid data found in CSV');
    }

    const headers = Object.keys(rows[0]!);
    const mapping = userMapping ?? smartDetectMapping(headers, rows);
    request.log.info({ headers, mapping, rowCount: rows.length }, 'CSV mapping resolved');

    // Ensure email column is detected
    if (!Object.values(mapping).includes('email')) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Could not detect an email column. Please ensure your CSV contains email addresses.',
      );
    }

    const resolvedListId = await resolveListId(listId, newListName);

    // Create import record
    const imp = await db
      .insertInto('imports')
      .values({
        type: ImportType.CSV,
        status: ImportStatus.PROCESSING,
        total_rows: rows.length,
        mapping_config: mapping,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Enqueue for worker via BullMQ
    const importQueue = new Queue('import', { connection: redis as unknown as ConnectionOptions });
    await importQueue.add('process', {
      importId: imp.id,
      data: csvContent,
      type: 'csv' as const,
      mapping,
      updateExisting,
      listId: resolvedListId,
    });
    await importQueue.close();

    return reply.status(202).send({ data: imp });
  });

  // GET /api/contacts/import/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();

    const imp = await db
      .selectFrom('imports')
      .selectAll()
      .where('id', '=', Number(request.params.id))
      .executeTakeFirst();

    if (!imp) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Import not found');
    }

    return reply.send({ data: imp });
  });

  // GET /api/contacts/import/:id/errors
  app.get<{ Params: { id: string } }>('/:id/errors', async (request, reply) => {
    const db = getDb();

    const imp = await db
      .selectFrom('imports')
      .selectAll()
      .where('id', '=', Number(request.params.id))
      .executeTakeFirst();

    if (!imp) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Import not found');
    }

    return reply.send({ data: imp.errors });
  });

  // POST /api/contacts/import/mappings
  app.post('/mappings', async (request, reply) => {
    const body = mappingPresetSchema.parse(request.body);
    const redis = getRedis();
    await redis.hset('twmail:mapping-presets', body.name, JSON.stringify(body.mapping));

    return reply.status(201).send({ data: { message: 'Mapping preset saved' } });
  });

  // GET /api/contacts/import/mappings
  app.get('/mappings', async (_request, reply) => {
    const redis = getRedis();
    const presets = await redis.hgetall('twmail:mapping-presets');
    const result: Record<string, Record<string, string>> = {};
    for (const [name, json] of Object.entries(presets)) {
      result[name] = JSON.parse(json) as Record<string, string>;
    }

    return reply.send({ data: result });
  });
};
