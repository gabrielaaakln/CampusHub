// runs before any module reads process env in config ts
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  process.env.TEST_DATABASE_URL ?? 'postgres://campushub:campushub@localhost:5432/campushub_test';
process.env.SESSION_SECRET ??= 'test-secret-value-long-enough-for-production-check';
process.env.DEV_LOGIN ??= 'true';
process.env.LOG_LEVEL ??= 'silent';
