import { defineConfig } from 'prisma/config';
import { config as loadDotenv } from 'dotenv';

// the cli runs from apps/api while the env file lives at the repo root
// with this file present prisma stops loading .env on its own
loadDotenv({ path: ['../../.env', '.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { seed: 'tsx src/seed/index.ts' },
});
