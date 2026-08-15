import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/lib/db.js';

const dbUp = await prisma
  .$queryRaw`SELECT 1`.then(() => true)
  .catch(() => false);

if (!dbUp) console.warn('skipping forum tests: no database at DATABASE_URL');

describe.skipIf(!dbUp)('forum', () => {
  const app = createApp();
  const agent = request.agent(app);
  let csrf = '';
  const author = 'forum.author@student.tuiasi.ro';
  const reader = 'forum.reader@student.tuiasi.ro';
  let categoryId = 0;
  let postId = 0;

  // the dev header picks the user the csrf token belongs to the shared session
  const as = (email: string) => ({ 'x-dev-user': email, 'x-csrf-token': csrf });

  beforeAll(async () => {
    csrf = (await agent.get('/api/v1/csrf').expect(200)).body.data.token;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE faculties, users RESTART IDENTITY CASCADE');
    await prisma.$executeRaw`
      INSERT INTO faculties (id, name, short_name) VALUES (${config.facultyId}, 'Test', 'TST')`;
    await prisma.$executeRaw`SELECT setval('faculties_id_seq', ${config.facultyId})`;

    const category = await prisma.forumCategory.create({
      data: { facultyId: config.facultyId, name: 'Anul 1', slug: 'anul-1' },
    });
    categoryId = category.id;

    for (const email of [author, reader]) {
      await prisma.user.create({
        data: {
          displayName: email.split('.')[0]!,
          email,
          passwordHash: 'x',
          facultyId: config.facultyId,
        },
      });
    }
  });

  it('refuses to publish without an account', async () => {
    // the token is there so the refusal comes from auth and not from csrf
    const res = await agent
      .post('/api/v1/forum/posts')
      .set('x-csrf-token', csrf)
      .send({ categoryId, title: 'Fără cont' })
      .expect(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('rejects a title that is too short', async () => {
    const res = await agent
      .post('/api/v1/forum/posts')
      .set(as(author))
      .send({ categoryId, title: 'abc' })
      .expect(422);
    expect(res.body.error.code).toBe('validation_failed');
  });

  it('publishes a post and lists it', async () => {
    const created = await agent
      .post('/api/v1/forum/posts')
      .set(as(author))
      .send({ categoryId, title: 'Unde se ține laboratorul?', content: 'Nu găsesc sala.' })
      .expect(201);

    postId = created.body.data.id;
    expect(created.body.data.commentCount).toBe(0);
    expect(created.body.data.score).toBe(0);

    const list = await agent.get('/api/v1/forum/posts').expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].title).toBe('Unde se ține laboratorul?');
  });

  it('counts a vote through the database trigger', async () => {
    const voted = await agent
      .post(`/api/v1/forum/posts/${postId}/vote`)
      .set(as(reader))
      .send({ value: 1 })
      .expect(200);
    expect(voted.body.data.score).toBe(1);

    const mine = await agent.get(`/api/v1/forum/posts/${postId}`).set(as(reader)).expect(200);
    expect(mine.body.data.myVote).toBe(1);
  });

  it('removes the vote when the same arrow is clicked again', async () => {
    const res = await agent
      .post(`/api/v1/forum/posts/${postId}/vote`)
      .set(as(reader))
      .send({ value: 0 })
      .expect(200);
    expect(res.body.data.score).toBe(0);
  });

  it('adds a comment and keeps comment_count in step', async () => {
    await agent
      .post(`/api/v1/forum/posts/${postId}/comments`)
      .set(as(reader))
      .send({ content: 'E la etajul 1, în Corp AC.' })
      .expect(201);

    const post = await agent.get(`/api/v1/forum/posts/${postId}`).expect(200);
    expect(post.body.data.commentCount).toBe(1);
  });

  it('sorts by score when asked', async () => {
    const second = await agent
      .post('/api/v1/forum/posts')
      .set(as(author))
      .send({ categoryId, title: 'A doua întrebare' })
      .expect(201);

    await agent
      .post(`/api/v1/forum/posts/${second.body.data.id}/vote`)
      .set(as(reader))
      .send({ value: 1 })
      .expect(200);

    const top = await agent.get('/api/v1/forum/posts?sort=top').expect(200);
    expect(top.body.data[0].id).toBe(second.body.data.id);
  });

  it('refuses to delete somebody else post', async () => {
    const res = await agent
      .delete(`/api/v1/forum/posts/${postId}`)
      .set(as(reader))
      .expect(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('deletes logically so the thread keeps its shape', async () => {
    await agent.delete(`/api/v1/forum/posts/${postId}`).set(as(author)).expect(204);

    const gone = await prisma.forumPost.findUniqueOrThrow({ where: { id: postId } });
    expect(gone.isDeleted).toBe(true);

    const list = await agent.get('/api/v1/forum/posts').expect(200);
    expect(list.body.data.some((p: { id: number }) => p.id === postId)).toBe(false);
  });

  it('never exposes an email address', async () => {
    const list = await agent.get('/api/v1/forum/posts').expect(200);
    expect(JSON.stringify(list.body)).not.toContain('@student.tuiasi.ro');
  });
});
