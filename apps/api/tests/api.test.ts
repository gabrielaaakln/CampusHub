import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/db.js';
import { config } from '../src/config.js';
import { resetConfigCache } from '../src/modules/config/routes.js';

const dbUp = await prisma
  .$queryRaw`SELECT 1`.then(() => true)
  .catch(() => false);

if (!dbUp) {
  console.warn('skipping API tests: no database at DATABASE_URL');
}

describe.skipIf(!dbUp)('api', () => {
  const app = createApp();
  const agent = request.agent(app);
  const email = `test.user@student.tuiasi.ro`;

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE faculties, users, user_sessions RESTART IDENTITY CASCADE',
    );
    await prisma.$executeRaw`
      INSERT INTO faculties (id, name, short_name) VALUES (${config.facultyId}, 'Test', 'TST')`;
    await prisma.$executeRaw`SELECT setval('faculties_id_seq', ${config.facultyId})`;
    resetConfigCache();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reports health including the database', async () => {
    const res = await agent.get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('exposes feature flags and the faculty', async () => {
    const res = await agent.get('/api/v1/config').expect(200);
    expect(res.body.features).toHaveProperty('scraper');
    expect(res.body.faculty.shortName).toBe('TST');
  });

  it('refuses a state changing call without a CSRF token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'whatever123' })
      .expect(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('refuses registration from outside the institutional domains', async () => {
    const token = await csrf();
    const res = await agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', token)
      .send({ displayName: 'Cineva', email: 'cineva@gmail.com', password: 'parola-buna-123' })
      .expect(400);
    expect(res.body.error.code).toBe('bad_request');
  });

  it('rejects a short password with a validation error', async () => {
    const token = await csrf();
    const res = await agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', token)
      .send({ displayName: 'Cineva', email, password: 'scurt' })
      .expect(422);
    expect(res.body.error.code).toBe('validation_failed');
  });

  it('registers, keeps the session, and logs out', async () => {
    const token = await csrf();
    const created = await agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', token)
      .send({ displayName: 'Ana Test', email, password: 'parola-buna-123' })
      .expect(201);
    expect(created.body.data.email).toBe(email);

    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.data.displayName).toBe('Ana Test');

    // the session id changed on register so a fresh token is needed
    // fetch it before building the request or the agent attaches the old cookie
    const logoutToken = await csrf();
    await agent.post('/api/v1/auth/logout').set('x-csrf-token', logoutToken).expect(204);

    const after = await agent.get('/api/v1/auth/me').expect(200);
    expect(after.body.data).toBeNull();
  });

  it('rejects a wrong password with the same message as a missing account', async () => {
    const firstToken = await csrf();
    const known = await agent
      .post('/api/v1/auth/login')
      .set('x-csrf-token', firstToken)
      .send({ email, password: 'gresita-total-123' })
      .expect(401);

    const secondToken = await csrf();
    const unknown = await agent
      .post('/api/v1/auth/login')
      .set('x-csrf-token', secondToken)
      .send({ email: 'nimeni@student.tuiasi.ro', password: 'gresita-total-123' })
      .expect(401);

    expect(known.body.error.message).toBe(unknown.body.error.message);
  });

  it('refuses a duplicate email regardless of letter case', async () => {
    const token = await csrf();
    const res = await agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', token)
      .send({ displayName: 'Alta', email: email.toUpperCase(), password: 'parola-buna-123' })
      .expect(409);
    expect(res.body.error.code).toBe('conflict');
  });

  it('answers 404 in the documented error shape', async () => {
    const res = await agent.get('/api/v1/nu-exista').expect(404);
    expect(res.body).toEqual({ error: { code: 'not_found', message: 'Ruta nu există' } });
  });

  async function csrf(): Promise<string> {
    const res = await agent.get('/api/v1/csrf').expect(200);
    return res.body.data.token;
  }
});
