import { Worker, type Job, type ConnectionOptions } from 'bullmq';
import { getDb, getRedis, ContactStatus, ImportStatus } from '@twmail/shared';
import { parse as csvParse } from 'csv-parse/sync';
import { logger } from '../logger.js';

export interface ImportJobData {
  importId: number;
  data: string;
  type: 'paste' | 'csv';
  mapping?: Record<string, string>;
  listId?: number;
  updateExisting?: boolean;
}

const STANDARD_FIELDS = new Set([
  'email',
  'first_name',
  'last_name',
  'phone',
  'company',
  'city',
  'country',
  'timezone',
  'source',
]);

/**
 * Import worker: processes contact imports from paste or CSV data.
 *
 * Processing:
 *   1. Load import record
 *   2. Parse data (paste: line-delimited, CSV: parsed with csv-parse)
 *   3. For each row: validate email, check existence, insert/update/skip
 *   4. Add contacts to list if listId specified
 *   5. Track counts: new_contacts, updated_contacts, skipped, errors
 *   6. Update import record with final status and counts
 *
 * COMP-07: Never re-subscribes suppressed contacts (bounced, complained, unsubscribed).
 */
export function createImportWorker(): Worker {
  const redis = getRedis();

  const worker = new Worker<ImportJobData>(
    'import',
    async (job: Job<ImportJobData>) => {
      const { importId, data, type, mapping = {}, listId, updateExisting = true } = job.data;
      const db = getDb();

      let newContacts = 0;
      let updatedContacts = 0;
      let skipped = 0;
      const errors: Array<{ row: number; message: string }> = [];

      // Parse rows based on import type
      let rows: Array<Record<string, string>>;

      try {
        if (type === 'paste') {
          rows = parsePasteData(data);
        } else {
          rows = parseCsvData(data, mapping);
        }
      } catch (parseErr) {
        logger.error({ importId, err: parseErr }, 'Import: failed to parse data');
        await db
          .updateTable('imports')
          .set({
            status: ImportStatus.FAILED,
            errors: JSON.stringify([{ row: 0, message: parseErr instanceof Error ? parseErr.message : 'Unknown parse error' }]) as unknown as Record<string, unknown>[],
          })
          .where('id', '=', importId)
          .execute();
        return { error: 'parse_failed' };
      }

      if (rows.length === 0) {
        await db
          .updateTable('imports')
          .set({
            status: ImportStatus.COMPLETED,
            total_rows: 0,
          })
          .where('id', '=', importId)
          .execute();
        return { newContacts: 0, updatedContacts: 0, skipped: 0, errorCount: 0 };
      }

      // Process rows in batches
      const batchSize = 1000;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);

        for (let j = 0; j < batch.length; j++) {
          const row = batch[j]!;
          const rowIdx = i + j + 1;

          try {
            // Map fields using the provided mapping
            const contact: Record<string, unknown> = {};
            const customFields: Record<string, unknown> = {};

            if (type === 'paste') {
              // For paste data, rows already have email, first_name, last_name keys
              for (const [key, value] of Object.entries(row)) {
                if (value === undefined || value === '') continue;
                if (STANDARD_FIELDS.has(key)) {
                  contact[key] = value;
                }
              }
            } else {
              // For CSV data, apply column mapping
              for (const [sourceCol, targetField] of Object.entries(mapping)) {
                const value = row[sourceCol];
                if (value === undefined || value === '') continue;
                if (targetField === 'skip') continue;

                if (STANDARD_FIELDS.has(targetField)) {
                  contact[targetField] = value;
                } else if (targetField.startsWith('custom.')) {
                  customFields[targetField.slice(7)] = value;
                } else {
                  customFields[targetField] = value;
                }
              }
            }

            if (!contact['email']) {
              errors.push({ row: rowIdx, message: 'Missing email address' });
              skipped++;
              continue;
            }

            const emailRaw = contact['email'];
            const email = (typeof emailRaw === 'string' ? emailRaw : '').trim().toLowerCase();

            // Basic email validation
            if (!email.includes('@') || !email.includes('.')) {
              errors.push({ row: rowIdx, message: `Invalid email: ${email}` });
              skipped++;
              continue;
            }

            // Check if contact already exists
            const existing = await db
              .selectFrom('contacts')
              .select(['id', 'status', 'custom_fields'])
              .where('email', '=', email)
              .executeTakeFirst();

            if (existing) {
              // COMP-07: Never re-subscribe suppressed contacts via import
              const isSuppressed =
                existing.status === ContactStatus.BOUNCED ||
                existing.status === ContactStatus.COMPLAINED ||
                existing.status === ContactStatus.UNSUBSCRIBED;

              if (isSuppressed) {
                skipped++;
                continue;
              }

              if (!updateExisting) {
                skipped++;
                continue;
              }

              // Merge custom fields with existing values
              const mergedCustom = {
                ...existing.custom_fields,
                ...customFields,
              };

              const updateData: Record<string, unknown> = {};
              for (const [key, value] of Object.entries(contact)) {
                if (key !== 'email' && value) {
                  updateData[key] = value;
                }
              }

              if (Object.keys(customFields).length > 0) {
                updateData['custom_fields'] = mergedCustom;
              }

              if (Object.keys(updateData).length > 0) {
                await db
                  .updateTable('contacts')
                  .set(updateData)
                  .where('id', '=', existing.id)
                  .execute();
              }

              // Add to list if specified
              if (listId) {
                await db
                  .insertInto('contact_lists')
                  .values({ contact_id: existing.id, list_id: listId })
                  .onConflict((oc) => oc.columns(['contact_id', 'list_id']).doNothing())
                  .execute();
              }

              updatedContacts++;
            } else {
              // Create new contact
              const newContact = await db
                .insertInto('contacts')
                .values({
                  email,
                  first_name: (contact['first_name'] as string) ?? null,
                  last_name: (contact['last_name'] as string) ?? null,
                  phone: (contact['phone'] as string) ?? null,
                  company: (contact['company'] as string) ?? null,
                  city: (contact['city'] as string) ?? null,
                  country: (contact['country'] as string) ?? null,
                  timezone: (contact['timezone'] as string) ?? null,
                  source: (contact['source'] as string) ?? 'csv_import',
                  custom_fields: Object.keys(customFields).length > 0 ? customFields : {},
                  status: ContactStatus.ACTIVE,
                })
                .returningAll()
                .executeTakeFirstOrThrow();

              // Add to list if specified
              if (listId) {
                await db
                  .insertInto('contact_lists')
                  .values({ contact_id: newContact.id, list_id: listId })
                  .onConflict((oc) => oc.columns(['contact_id', 'list_id']).doNothing())
                  .execute();
              }

              newContacts++;
            }
          } catch (err: unknown) {
            errors.push({
              row: rowIdx,
              message: err instanceof Error ? err.message : 'Unknown error',
            });
            skipped++;
          }
        }

        // Report progress
        const progress = Math.round(((i + batch.length) / rows.length) * 100);
        await job.updateProgress(progress);
        await redis.publish(`twmail:import:${importId}`, JSON.stringify({ progress }));
      }

      // Update import record with final results
      const finalStatus = errors.length > 0 && newContacts === 0 && updatedContacts === 0
        ? ImportStatus.FAILED
        : ImportStatus.COMPLETED;

      await db
        .updateTable('imports')
        .set({
          status: finalStatus,
          total_rows: rows.length,
          new_contacts: newContacts,
          updated_contacts: updatedContacts,
          skipped,
          errors: JSON.stringify(errors.length > 0 ? errors : []) as unknown as Record<string, unknown>[],
        })
        .where('id', '=', importId)
        .execute();

      logger.info(
        { importId, newContacts, updatedContacts, skipped, errorCount: errors.length },
        'Import completed',
      );

      return { newContacts, updatedContacts, skipped, errorCount: errors.length };
    },
    {
      connection: redis as unknown as ConnectionOptions,
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, importId: job?.data?.importId, err }, 'Import job failed');

    // Mark import as failed if the job itself fails
    if (job?.data?.importId) {
      const db = getDb();
      db.updateTable('imports')
        .set({
          status: ImportStatus.FAILED,
          errors: JSON.stringify([{ row: 0, message: err?.message ?? 'Unknown worker error' }]) as unknown as Record<string, unknown>[],
        })
        .where('id', '=', job.data.importId)
        .execute()
        .catch((updateErr) => {
          logger.error({ err: updateErr }, 'Failed to update import record after job failure');
        });
    }
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Import worker error');
  });

  return worker;
}

/**
 * Parse paste data: each line is either:
 *   - An email address only
 *   - email,first_name,last_name (comma-separated)
 */
function parsePasteData(data: string): Array<Record<string, string>> {
  const lines = data
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map((line) => {
    const parts = line.split(',').map((p) => p.trim());
    const record: Record<string, string> = {};

    if (parts[0]) record['email'] = parts[0];
    if (parts[1]) record['first_name'] = parts[1];
    if (parts[2]) record['last_name'] = parts[2];

    return record;
  });
}

/**
 * Parse CSV data using csv-parse, then return rows as Record<string, string>
 * arrays where keys are the CSV column headers.
 */
function parseCsvData(data: string, _mapping: Record<string, string>): Array<Record<string, string>> {
  // Normalize line endings before parsing
  const normalized = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const records = csvParse(normalized, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
  }) as Array<Record<string, string>>;

  // Lowercase all keys to match the mapping from the API
  return records.map((row) => {
    const lowered: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      lowered[key.toLowerCase().trim()] = value;
    }
    return lowered;
  });
}
