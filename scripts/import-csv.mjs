import pg from 'pg';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const csv = readFileSync('/tmp/test.csv', 'utf-8');
const normalized = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const records = parse(normalized, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true, relax_quotes: true });
console.log('Parsed', records.length, 'rows');

// Delete the lowercase "franchise" list (id 14)
await pool.query('DELETE FROM contact_lists WHERE list_id = 14');
await pool.query('DELETE FROM lists WHERE id = 14');
console.log('Deleted list id=14 (franchise)');

// Use list id=15 (Franchise)
const listId = 15;
let newContacts = 0;
let updated = 0;
let skipped = 0;

for (const row of records) {
  const email = (row['Email'] || '').trim().toLowerCase();
  if (!email || !email.includes('@')) { skipped++; continue; }

  const firstName = (row['First-Name'] || '').trim();
  const lastName = (row['Last-Name'] || '').trim();
  const phone = (row['MobileNumber'] || '').trim();
  const city = (row['City'] || '').trim();
  const country = (row['Country'] || '').trim();
  const source = (row['Source'] || 'csv_import').trim();

  const existing = await pool.query('SELECT id FROM contacts WHERE email = $1', [email]);

  if (existing.rows.length > 0) {
    const cid = existing.rows[0].id;
    await pool.query(
      `UPDATE contacts SET
        first_name = COALESCE(NULLIF($2, ''), first_name),
        last_name = COALESCE(NULLIF($3, ''), last_name),
        phone = COALESCE(NULLIF($4, ''), phone),
        city = COALESCE(NULLIF($5, ''), city),
        country = COALESCE(NULLIF($6, ''), country)
      WHERE id = $7`,
      [firstName, lastName, phone, city, country, cid]
    );
    await pool.query('INSERT INTO contact_lists (contact_id, list_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [cid, listId]);
    updated++;
  } else {
    const ins = await pool.query(
      'INSERT INTO contacts (email, first_name, last_name, phone, city, country, source, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 1) RETURNING id',
      [email, firstName, lastName, phone, city, country, source]
    );
    await pool.query('INSERT INTO contact_lists (contact_id, list_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ins.rows[0].id, listId]);
    newContacts++;
  }
}

console.log('Done! New:', newContacts, 'Updated:', updated, 'Skipped:', skipped);

const count = await pool.query('SELECT count(*) FROM contact_lists WHERE list_id = $1', [listId]);
console.log('Franchise list now has', count.rows[0].count, 'contacts');

await pool.end();
