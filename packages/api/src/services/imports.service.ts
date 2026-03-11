import { getDb, getRedis, ErrorCode, ImportType, ImportStatus } from '@twmail/shared';
import type { Import } from '@twmail/shared';
import { AppError } from '../plugins/error-handler.js';

// Auto-detection mappings for common column names
const AUTO_FIELD_MAP: Record<string, string> = {
  email: 'email', 'e-mail': 'email', email_address: 'email', emailaddress: 'email',
  first_name: 'first_name', firstname: 'first_name', first: 'first_name', given_name: 'first_name',
  last_name: 'last_name', lastname: 'last_name', last: 'last_name', surname: 'last_name', family_name: 'last_name',
  phone: 'phone', telephone: 'phone', mobile: 'phone',
  company: 'company', organization: 'company', org: 'company',
  city: 'city', town: 'city',
  country: 'country',
};

export async function createPasteImport(data: {
  text: string;
  listId?: number;
  updateExisting?: boolean;
}): Promise<Import> {
  const rows = parsePastedText(data.text);
  if (rows.length === 0) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'No valid data found in pasted text');
  }

  const headers = Object.keys(rows[0]!);
  const mapping = autoDetectMapping(headers);

  return enqueueImport(ImportType.PASTE, rows, mapping, data.listId, data.updateExisting);
}

export async function createCsvImport(data: {
  csvContent: string;
  mapping?: Record<string, string>;
  listId?: number;
  updateExisting?: boolean;
}): Promise<Import> {
  const rows = parseCsv(data.csvContent);
  if (rows.length === 0) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'No valid data found in CSV');
  }

  const headers = Object.keys(rows[0]!);
  const mapping = data.mapping ?? autoDetectMapping(headers);

  return enqueueImport(ImportType.CSV, rows, mapping, data.listId, data.updateExisting);
}

export async function getImport(id: number): Promise<Import> {
  const db = getDb();
  const imp = await db
    .selectFrom('imports')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  if (!imp) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Import not found');
  }
  return imp;
}

export async function getImportErrors(id: number): Promise<Record<string, unknown> | null> {
  const imp = await getImport(id);
  return imp.errors;
}

// Mapping presets stored in a simple JSON format in Redis
export async function saveMappingPreset(name: string, mapping: Record<string, string>): Promise<void> {
  const redis = getRedis();
  await redis.hset('twmail:mapping-presets', name, JSON.stringify(mapping));
}

export async function listMappingPresets(): Promise<Record<string, Record<string, string>>> {
  const redis = getRedis();
  const presets = await redis.hgetall('twmail:mapping-presets');
  const result: Record<string, Record<string, string>> = {};
  for (const [name, json] of Object.entries(presets)) {
    result[name] = JSON.parse(json);
  }
  return result;
}

// Internal helpers

async function enqueueImport(
  type: number,
  rows: Array<Record<string, string>>,
  mapping: Record<string, string>,
  listId?: number,
  updateExisting?: boolean,
): Promise<Import> {
  const db = getDb();
  const redis = getRedis();

  // Create import record
  const imp = await db
    .insertInto('imports')
    .values({
      type,
      status: ImportStatus.PROCESSING,
      total_rows: rows.length,
      mapping_config: mapping,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Enqueue for worker
  await redis.lpush(
    'twmail:import-jobs',
    JSON.stringify({
      importId: imp.id,
      rows,
      mapping,
      updateExisting: updateExisting ?? true,
      listId,
    }),
  );

  return imp;
}

function parsePastedText(text: string): Array<Record<string, string>> {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Detect format: tabs, commas, or one-per-line
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

  // Parse with header
  const headers = firstLine.split(delimiter).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? '').trim();
    });
    return row;
  });
}

function parseCsv(content: string): Array<Record<string, string>> {
  const lines = content.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Detect delimiter
  const firstLine = lines[0]!;
  let delimiter = ',';
  if (firstLine.includes('\t')) delimiter = '\t';
  else if (firstLine.includes(';')) delimiter = ';';
  else if (firstLine.includes('|')) delimiter = '|';

  const headers = parseCsvLine(firstLine, delimiter).map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? '').trim();
    });
    return row;
  });
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

function autoDetectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const normalized = header.toLowerCase().replace(/[^a-z_]/g, '');
    mapping[header] = AUTO_FIELD_MAP[normalized] ?? `custom.${header}`;
  }
  return mapping;
}
