#!/usr/bin/env node
/**
 * Seed script to create the initial admin user.
 *
 * Usage:
 *   npx tsx packages/api/src/seed-admin.ts --email admin@example.com --password 'securepass'
 *   # or from packages/api:
 *   npm run seed:admin -- --email admin@example.com --password 'securepass'
 *
 * Environment: DATABASE_URL must be set.
 *
 * Required flags:
 *   --email    Admin email address
 *   --password Admin password
 * Optional:
 *   --name     Display name (default: "Admin")
 */
import { getDb, destroyDb } from '@twmail/shared';
import bcrypt from 'bcrypt';
import { UserRole } from '@twmail/shared';

const BCRYPT_ROUNDS = 12;

async function main() {
  const args = process.argv.slice(2);
  function getArg(flag: string, fallback?: string): string | undefined {
    const idx = args.indexOf(flag);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1]!;
    return fallback;
  }

  const email = getArg('--email');
  const name: string = getArg('--name', 'Admin')!;
  const password = getArg('--password');

  if (!email || !password) {
    console.error('Error: --email and --password flags are required.');
    console.error('Usage: npx tsx seed-admin.ts --email <email> --password <password> [--name <name>]');
    process.exit(1);
  }

  const db = getDb();

  // Check if user already exists
  const existing = await db.selectFrom('users')
    .select('id')
    .where('email', '=', email)
    .executeTakeFirst();

  if (existing) {
    console.log(`User "${email}" already exists (id=${existing.id}). Skipping.`);
    await destroyDb();
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await db.insertInto('users')
    .values({
      email,
      name,
      password_hash: passwordHash,
      role: UserRole.ADMIN,
    })
    .returning(['id', 'email', 'name', 'role'])
    .executeTakeFirstOrThrow();

  console.log(`Admin user created:`);
  console.log(`  ID:    ${user.id}`);
  console.log(`  Email: ${user.email}`);
  console.log(`  Name:  ${user.name}`);
  console.log(`  Role:  Admin`);
  console.log(`  Pass:  ********`);

  await destroyDb();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
