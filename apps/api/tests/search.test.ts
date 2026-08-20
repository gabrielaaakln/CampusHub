import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/lib/db.js';

const dbUp = await prisma
  .$queryRaw`SELECT 1`.then(() => true)
  .catch(() => false);

if (!dbUp) console.warn('skipping search tests: no database at DATABASE_URL');

describe.skipIf(!dbUp)('search', () => {
  const app = createApp();
  const agent = request.agent(app);

  beforeAll(async () => {
    await agent.get('/api/v1/csrf').expect(200);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE faculties, users RESTART IDENTITY CASCADE');
    await prisma.$executeRaw`
      INSERT INTO faculties (id, name, short_name) VALUES (${config.facultyId}, 'Test', 'TST')`;
    await prisma.$executeRaw`SELECT setval('faculties_id_seq', ${config.facultyId})`;

    const user = await prisma.user.create({
      data: {
        displayName: 'Autor',
        email: 'search.author@student.tuiasi.ro',
        passwordHash: 'x',
        facultyId: config.facultyId,
      },
    });
    const category = await prisma.forumCategory.create({
      data: { facultyId: config.facultyId, name: 'Sesiune', slug: 'sesiune' },
    });

    await prisma.forumPost.create({
      data: {
        categoryId: category.id,
        authorId: user.id,
        title: 'Cum se contestă o notă?',
        content: 'Contestația se depune în 24 de ore la secretariat.',
      },
    });
    await prisma.forumPost.create({
      data: {
        categoryId: category.id,
        authorId: user.id,
        title: 'Postare ștearsă despre bursă',
        content: 'Bursa socială.',
        isDeleted: true,
      },
    });
    await prisma.listing.create({
      data: {
        facultyId: config.facultyId,
        authorId: user.id,
        kind: 'produs',
        title: 'Vând bicicletă',
        description: 'Bicicletă de oraș, roți de 28.',
      },
    });
    await prisma.rightsArticle.create({
      data: {
        facultyId: config.facultyId,
        category: 'Burse',
        title: 'Bursa socială',
        summary: 'Se acordă în funcție de venitul pe membru de familie.',
      },
    });
  });

  it('refuses a query that is too short', async () => {
    const res = await agent.get('/api/v1/search?q=a').expect(422);
    expect(res.body.error.code).toBe('validation_failed');
  });

  it('finds a post without diacritics in the query', async () => {
    const res = await agent.get('/api/v1/search?q=contestatie').expect(200);
    expect(res.body.meta.counts.post).toBe(1);
    expect(res.body.data[0].type).toBe('post');
    expect(res.body.data[0].link).toMatch(/^\/forum\/\d+$/);
  });

  it('searches the three sources at once', async () => {
    const res = await agent.get('/api/v1/search?q=bursa').expect(200);
    const types = res.body.data.map((h: { type: string }) => h.type);
    expect(types).toContain('rights');
    expect(res.body.meta.counts.post).toBe(0);
  });

  it('narrows to one type when asked', async () => {
    const res = await agent.get('/api/v1/search?q=bicicleta&type=listing').expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Vând bicicletă');
    expect(res.body.meta.counts.post).toBe(0);
  });

  it('answers an empty list instead of an error when nothing matches', async () => {
    const res = await agent.get('/api/v1/search?q=tramvai').expect(200);
    expect(res.body.data).toEqual([]);
  });
});
