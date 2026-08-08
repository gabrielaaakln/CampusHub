import { spawnSync } from 'node:child_process';

// the test database is separate so a test run never touches demo data
const url =
  process.env.TEST_DATABASE_URL ?? 'postgres://campushub:campushub@localhost:5432/campushub_test';

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
  shell: true,
});

process.exit(result.status ?? 1);
