import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createPasteImport,
  createCsvImport,
  getImport,
  getImportErrors,
  saveMappingPreset,
  listMappingPresets,
} from '../services/imports.service.js';
import { requireAuth } from '../middleware/auth.js';

const pasteSchema = z.object({
  text: z.string().min(1),
  list_id: z.number().optional(),
  update_existing: z.boolean().optional(),
});

const csvSchema = z.object({
  csv_content: z.string().min(1),
  mapping: z.record(z.string()).optional(),
  list_id: z.number().optional(),
  update_existing: z.boolean().optional(),
});

const mappingPresetSchema = z.object({
  name: z.string().min(1).max(100),
  mapping: z.record(z.string()),
});

export const importRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // POST /api/contacts/import/paste
  app.post('/paste', async (request, reply) => {
    const body = pasteSchema.parse(request.body);
    const imp = await createPasteImport({
      text: body.text,
      listId: body.list_id,
      updateExisting: body.update_existing,
    });
    reply.status(202);
    return { data: imp };
  });

  // POST /api/contacts/import/csv
  app.post('/csv', async (request, reply) => {
    const body = csvSchema.parse(request.body);
    const imp = await createCsvImport({
      csvContent: body.csv_content,
      mapping: body.mapping,
      listId: body.list_id,
      updateExisting: body.update_existing,
    });
    reply.status(202);
    return { data: imp };
  });

  // GET /api/contacts/import/:id
  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    const imp = await getImport(Number(request.params.id));
    return { data: imp };
  });

  // GET /api/contacts/import/:id/errors
  app.get<{ Params: { id: string } }>('/:id/errors', async (request) => {
    const errors = await getImportErrors(Number(request.params.id));
    return { data: errors };
  });

  // POST /api/contacts/import/mappings
  app.post('/mappings', async (request, reply) => {
    const body = mappingPresetSchema.parse(request.body);
    await saveMappingPreset(body.name, body.mapping);
    reply.status(201);
    return { data: { message: 'Mapping preset saved' } };
  });

  // GET /api/contacts/import/mappings
  app.get('/mappings', async () => {
    const presets = await listMappingPresets();
    return { data: presets };
  });
};
