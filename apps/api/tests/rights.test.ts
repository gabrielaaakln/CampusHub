import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/lib/db.js';

const dbUp = await prisma
  .$queryRaw`SELECT 1`.then(() => true)
  .catch(() => false);

if (!dbUp) console.warn('skipping rights tests: no database at DATABASE_URL');

describe.skipIf(!dbUp)('rights', () => {
  const app = createApp();
  const agent = request.agent(app);

  beforeAll(async () => {
    await agent.get('/api/v1/csrf').expect(200);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE faculties, users RESTART IDENTITY CASCADE');
    await prisma.$executeRaw`
      INSERT INTO faculties (id, name, short_name) VALUES (${config.facultyId}, 'Test', 'TST')`;
    await prisma.$executeRaw`SELECT setval('faculties_id_seq', ${config.facultyId})`;

    await prisma.rightsArticle.createMany({
      data: [
        {
          facultyId: config.facultyId,
          category: 'Burse',
          title: 'Bursa socială',
          summary: 'Se acordă în funcție de venitul pe membru de familie.',
          position: 0,
        },
        {
          facultyId: config.facultyId,
          category: 'Examinare',
          title: 'Contestația la examen',
          summary: 'Se depune în 24 de ore de la afișarea rezultatului.',
          position: 1,
        },
        {
          facultyId: null,
          category: 'Date personale',
          title: 'Accesul la propriile date',
          summary: 'Poți cere secretariatului situația școlară.',
          position: 2,
        },
      ],
    });
  });

  it('lists the faculty articles and the university wide ones together', async () => {
    const res = await agent.get('/api/v1/rights').expect(200);
    expect(res.body.meta.total).toBe(3);
    expect(res.body.meta.categories).toEqual(['Burse', 'Date personale', 'Examinare']);
  });

  it('filters by category', async () => {
    const res = await agent.get('/api/v1/rights?category=Burse').expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].title).toBe('Bursa socială');
  });

  it('finds an article written with diacritics when searched without them', async () => {
    const res = await agent.get('/api/v1/rights?q=contestatie').expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Contestația la examen');
  });

  it('matches the stem so a singular query finds the plural', async () => {
    const res = await agent.get('/api/v1/rights?q=burse').expect(200);
    expect(res.body.data[0].category).toBe('Burse');
  });

  it('answers an empty list instead of an error when nothing matches', async () => {
    const res = await agent.get('/api/v1/rights?q=tramvai').expect(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
    expect(res.body.meta.categories).toHaveLength(3);
  });
});
