import pg from 'pg';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const csv = readFileSync('/tmp/leads.csv', 'utf-8');
const normalized = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const records = parse(normalized, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true, relax_quotes: true });
console.log('Parsed', records.length, 'rows');

const listId = 15;
let newContacts = 0;
let updated = 0;
let skipped = 0;

for (const row of records) {
  const email = (row['Email'] || '').trim().toLowerCase();
  if (!email || !email.includes('@') || !email.includes('.')) { skipped++; continue; }

  const firstName = (row['First Name'] || '').trim();
  const lastName = (row['Last Name'] || '').trim();
  const phone = (row['Phone'] || '').trim();
  const city = (row['City'] || '').trim();
  const country = (row['Country'] || '').trim();
  const source = (row['Lead Source'] || 'zoho_import').trim();

  try {
    const existing = await pool.query('SELECT id FROM contacts WHERE email = $1::text', [email]);

    let contactId;
    if (existing.rows.length > 0) {
      contactId = Number(existing.rows[0].id);
      if (firstName) await pool.query('UPDATE contacts SET first_name = $1::text WHERE id = $2::bigint AND first_name = $$$$', [firstName, contactId]);
      if (lastName) await pool.query('UPDATE contacts SET last_name = $1::text WHERE id = $2::bigint AND last_name = $$$$', [lastName, contactId]);
      if (phone) await pool.query('UPDATE contacts SET phone = $1::text WHERE id = $2::bigint AND phone = $$$$', [phone, contactId]);
      if (city) await pool.query('UPDATE contacts SET city = $1::text WHERE id = $2::bigint AND city = $$$$', [city, contactId]);
      updated++;
    } else {
      const ins = await pool.query(
        'INSERT INTO contacts (email, first_name, last_name, phone, city, country, source, status) VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, 1) RETURNING id',
        [email, firstName, lastName, phone, city, country, source]
      );
      contactId = Number(ins.rows[0].id);
      newContacts++;
    }

    await pool.query(
      'INSERT INTO contact_lists (contact_id, list_id) VALUES ($1::bigint, $2::bigint) ON CONFLICT (contact_id, list_id) DO NOTHING',
      [contactId, listId]
    );
  } catch (err) {
    console.error('Error on row:', email, err.message);
    skipped++;
  }
}

console.log('Done! New:', newContacts, 'Updated:', updated, 'Skipped:', skipped);

const count = await pool.query('SELECT count(*) FROM contact_lists WHERE list_id = $1::bigint', [listId]);
console.log('Franchise list now has', count.rows[0].count, 'contacts');

await pool.end();
