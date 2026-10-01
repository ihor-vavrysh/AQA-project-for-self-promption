import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { seedTaxonomy } from './taxonomy-seed.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL must be set before seeding the taxonomy');
}

const pool = new Pool({ connectionString });

try {
  const result = await seedTaxonomy(drizzle(pool));
  process.stdout.write(`Seeded ${result.nodes} taxonomy nodes\n`);
} finally {
  await pool.end();
}
