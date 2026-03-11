import { Worker, type Job } from 'bullmq';
import { getDb, getRedis, ContactStatus, ImportStatus } from '@twmail/shared';

export interface ImportJobData {
  importId: number;
  rows: Array<Record<string, string>>;
  mapping: Record<string, string>; // source column → target field
  updateExisting?: boolean;
  listId?: number;
}

const STANDARD_FIELDS = new Set([
  'email', 'first_name', 'last_name', 'phone', 'company',
  'city', 'country', 'timezone', 'source',
]);

export function createImportWorker(): Worker {
  const redis = getRedis();

  const worker = new Worker<ImportJobData>(
    'import',
    async (job: Job<ImportJobData>) => {
      const { importId, rows, mapping, updateExisting = true, listId } = job.data;
      const db = getDb();

      let newContacts = 0;
      let updatedContacts = 0;
      let skipped = 0;
      const errors: Array<{ row: number; message: string }> = [];

      const batchSize = 1000;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);

        for (let j = 0; j < batch.length; j++) {
          const row = batch[j]!;
          const rowIdx = i + j + 1;

          try {
            // Map fields
            const contact: Record<string, unknown> = {};
            const customFields: Record<string, unknown> = {};

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

            if (!contact['email']) {
              errors.push({ row: rowIdx, message: 'Missing email address' });
              skipped++;
              continue;
            }

            const email = String(contact['email']).trim().toLowerCase();

            // Basic email validation
            if (!email.includes('@') || !email.includes('.')) {
              errors.push({ row: rowIdx, message: `Invalid email: ${email}` });
              skipped++;
              continue;
            }

            // Check if contact exists
            const existing = await db
              .selectFrom('contacts')
              .select(['id', 'custom_fields'])
              .where('email', '=', email)
              .executeTakeFirst();

            if (existing) {
              if (!updateExisting) {
                skipped++;
                continue;
              }

              // Merge custom fields
              const mergedCustom = {
                ...(existing.custom_fields as Record<string, unknown>),
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
          } catch (err: any) {
            errors.push({ row: rowIdx, message: err.message ?? 'Unknown error' });
            skipped++;
          }
        }

        // Report progress
        const progress = Math.round(((i + batch.length) / rows.length) * 100);
        await job.updateProgress(progress);
        await redis.publish(`twmail:import:${importId}`, JSON.stringify({ progress }));
      }

      // Update import record
      await db
        .updateTable('imports')
        .set({
          status: ImportStatus.COMPLETED,
          total_rows: rows.length,
          new_contacts: newContacts,
          updated_contacts: updatedContacts,
          skipped,
          errors: errors.length > 0 ? (errors as any) : null,
          completed_at: new Date(),
        })
        .where('id', '=', importId)
        .execute();

      return { newContacts, updatedContacts, skipped, errorCount: errors.length };
    },
    {
      connection: redis as any,
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`Import job ${job?.id} failed:`, err.message);
  });

  return worker;
}
