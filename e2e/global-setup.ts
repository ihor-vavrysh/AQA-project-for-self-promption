import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Migrates and seeds before the suite runs.
 *
 * The Playwright `webServer` entries start the API and web app but never touch the
 * database, so without this the suite can only assert on an empty catalogue.
 */
const repoRoot = resolve(import.meta.dirname, '..');

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://tutorforge:tutorforge_dev@127.0.0.1:5432/tutorforge';

function run(args: string[]): void {
  execFileSync('pnpm', args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

export default function globalSetup(): void {
  run(['--filter', '@tutorforge/api', 'db:migrate']);
  // The seed entry points run from the compiled output.
  run(['--filter', '@tutorforge/api', 'build']);
  run(['--filter', '@tutorforge/api', 'db:seed:demo']);
}
