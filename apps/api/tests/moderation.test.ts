import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/lib/db.js';

const dbUp = await prisma
  .$queryRaw`SELECT 1`.then(() => true)
  .catch(() => false);

if (!dbUp) console.warn('skipping moderation tests: no database at DATABASE_URL');

describe.skipIf(!dbUp)('moderation', () => {
  const app = createApp();
  const agent = request.agent(app);
  let csrf = '';
  const moderator = 'mod.maria@tuiasi.ro';
  const author = 'mod.author@student.tuiasi.ro';
  const reporter = 'mod.reporter@student.tuiasi.ro';
  let postId = 0;
  let listingId = 0;
  let reportId = 0;

  // the dev header picks the user the csrf token belongs to the shared session
  const as = (email: string) => ({ 'x-dev-user': email, 'x-csrf-token': csrf });

  beforeAll(async () => {
    csrf = (await agent.get('/api/v1/csrf').expect(200)).body.data.token;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE faculties, users RESTART IDENTITY CASCADE');
    await prisma.$executeRaw`
      INSERT INTO faculties (id, name, short_name) VALUES (${config.facultyId}, 'Test', 'TST')`;
    await prisma.$executeRaw`SELECT setval('faculties_id_seq', ${config.facultyId})`;

    await prisma.user.create({
      data: {
        displayName: 'Maria',
        email: moderator,
        passwordHash: 'x',
        role: 'moderator',
        facultyId: config.facultyId,
      },
    });
    for (const email of [author, reporter]) {
      await prisma.user.create({
        data: {
          displayName: email.split('.')[1]!,
          email,
          passwordHash: 'x',
          facultyId: config.facultyId,
        },
      });
    }

    const category = await prisma.forumCategory.create({
      data: { facultyId: config.facultyId, name: 'Timp liber', slug: 'timp-liber' },
    });
    const authorRow = await prisma.user.findUniqueOrThrow({ where: { email: author } });

    const post = await prisma.forumPost.create({
      data: {
        categoryId: category.id,
        authorId: authorRow.id,
        title: 'Vând bilete la prețul dublu',
        content: 'Scriu pe privat.',
      },
    });
    postId = post.id;

    const listing = await prisma.listing.create({
      data: {
        facultyId: config.facultyId,
        authorId: authorRow.id,
        kind: 'serviciu',
        title: 'Scriu lucrarea de licență la comandă',
      },
    });
    listingId = listing.id;
  });

  it('refuses a report without an account', async () => {
    const res = await agent
      .post('/api/v1/reports')
      .set('x-csrf-token', csrf)
      .send({ targetType: 'post', targetId: postId, reason: 'Reclamă' })
      .expect(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('refuses a report on content that does not exist', async () => {
    const res = await agent
      .post('/api/v1/reports')
      .set(as(reporter))
      .send({ targetType: 'post', targetId: 9_999, reason: 'Nu există' })
      .expect(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('refuses a report on your own content', async () => {
    const res = await agent
      .post('/api/v1/reports')
      .set(as(author))
      .send({ targetType: 'post', targetId: postId, reason: 'Testez' })
      .expect(400);
    expect(res.body.error.code).toBe('bad_request');
  });

  it('accepts a report and refuses the same one twice', async () => {
    const created = await agent
      .post('/api/v1/reports')
      .set(as(reporter))
      .send({ targetType: 'post', targetId: postId, reason: 'Nu are legătură cu facultatea' })
      .expect(201);
    reportId = created.body.data.id;

    const again = await agent
      .post('/api/v1/reports')
      .set(as(reporter))
      .send({ targetType: 'post', targetId: postId, reason: 'Din nou' })
      .expect(409);
    expect(again.body.error.code).toBe('conflict');
  });

  it('keeps the queue out of reach of students', async () => {
    const res = await agent.get('/api/v1/moderation/reports').set(as(reporter)).expect(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('shows the moderator the queue with the target resolved', async () => {
    const res = await agent.get('/api/v1/moderation/reports').set(as(moderator)).expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.meta.counts.open).toBe(1);

    const row = res.body.data[0];
    expect(row.targetType).toBe('post');
    expect(row.target.title).toBe('Vând bilete la prețul dublu');
    expect(row.target.link).toBe(`/forum/${postId}`);
    expect(row.target.isDeleted).toBe(false);
  });

  it('deletes the reported post logically and tells the author', async () => {
    const res = await agent
      .patch(`/api/v1/moderation/reports/${reportId}`)
      .set(as(moderator))
      .send({ status: 'resolved', deleteTarget: true })
      .expect(200);
    expect(res.body.data.status).toBe('resolved');
    expect(res.body.data.target.isDeleted).toBe(true);

    const post = await prisma.forumPost.findUniqueOrThrow({ where: { id: postId } });
    expect(post.isDeleted).toBe(true);

    const authorRow = await prisma.user.findUniqueOrThrow({ where: { email: author } });
    const notified = await prisma.notification.findMany({
      where: { userId: authorRow.id, type: 'content_removed' },
    });
    expect(notified).toHaveLength(1);
  });

  it('answers every open report on the same target at once', async () => {
    const first = await agent
      .post('/api/v1/reports')
      .set(as(reporter))
      .send({ targetType: 'listing', targetId: listingId, reason: 'Fraudă academică' })
      .expect(201);
    await agent
      .post('/api/v1/reports')
      .set(as(moderator))
      .send({ targetType: 'listing', targetId: listingId, reason: 'Și eu' })
      .expect(201);

    await agent
      .patch(`/api/v1/moderation/reports/${first.body.data.id}`)
      .set(as(moderator))
      .send({ status: 'resolved', deleteTarget: true })
      .expect(200);

    const open = await agent
      .get('/api/v1/moderation/reports?status=open')
      .set(as(moderator))
      .expect(200);
    expect(open.body.meta.total).toBe(0);

    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(listing.isDeleted).toBe(true);
  });

  it('refuses to delete an account from the moderation panel', async () => {
    const authorRow = await prisma.user.findUniqueOrThrow({ where: { email: author } });
    const created = await agent
      .post('/api/v1/reports')
      .set(as(reporter))
      .send({ targetType: 'user', targetId: authorRow.id, reason: 'Trimite mesaje nepotrivite' })
      .expect(201);

    const res = await agent
      .patch(`/api/v1/moderation/reports/${created.body.data.id}`)
      .set(as(moderator))
      .send({ status: 'resolved', deleteTarget: true })
      .expect(400);
    expect(res.body.error.code).toBe('bad_request');

    // the refusal must not have answered the report either
    const still = await prisma.report.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(still.status).toBe('open');
  });

  it('never exposes an email address', async () => {
    const queue = await agent
      .get('/api/v1/moderation/reports?status=resolved')
      .set(as(moderator))
      .expect(200);
    expect(JSON.stringify(queue.body)).not.toContain('@student.tuiasi.ro');
  });
});
