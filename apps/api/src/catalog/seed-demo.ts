import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { seedDemoCatalog } from './demo-seed.js';
import { seedTaxonomy } from './taxonomy-seed.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL must be set before seeding demo data');
}

const pool = new Pool({ connectionString });

try {
  const db = drizzle(pool);
  const taxonomy = await seedTaxonomy(db);
  const demo = await seedDemoCatalog(db);
  process.stdout.write(
    `Seeded ${taxonomy.nodes} taxonomy nodes and ${demo.resources} demo resources on ${demo.nodeSlug}\n`,
  );
} finally {
  await pool.end();
}
