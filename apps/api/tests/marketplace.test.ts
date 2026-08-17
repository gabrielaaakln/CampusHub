import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/lib/db.js';

const dbUp = await prisma
  .$queryRaw`SELECT 1`.then(() => true)
  .catch(() => false);

if (!dbUp) console.warn('skipping marketplace tests: no database at DATABASE_URL');

describe.skipIf(!dbUp)('marketplace', () => {
  const app = createApp();
  const agent = request.agent(app);
  let csrf = '';
  const seller = 'market.seller@student.tuiasi.ro';
  const buyer = 'market.buyer@student.tuiasi.ro';
  let listingId = 0;
  let requestId = 0;

  // the dev header picks the user the csrf token belongs to the shared session
  const as = (email: string) => ({ 'x-dev-user': email, 'x-csrf-token': csrf });

  beforeAll(async () => {
    csrf = (await agent.get('/api/v1/csrf').expect(200)).body.data.token;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE faculties, users RESTART IDENTITY CASCADE');
    await prisma.$executeRaw`
      INSERT INTO faculties (id, name, short_name) VALUES (${config.facultyId}, 'Test', 'TST')`;
    await prisma.$executeRaw`SELECT setval('faculties_id_seq', ${config.facultyId})`;

    for (const email of [seller, buyer]) {
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

  it('publishes a listing with a price', async () => {
    const res = await agent
      .post('/api/v1/listings')
      .set(as(seller))
      .send({ kind: 'produs', title: 'Curs de analiză, ediția 2024', price: 40 })
      .expect(201);

    listingId = res.body.data.id;
    expect(res.body.data.price).toBe(40);
    expect(res.body.data.currency).toBe('RON');
    expect(res.body.data.isMine).toBe(true);
  });

  it('filters by kind', async () => {
    await agent
      .post('/api/v1/listings')
      .set(as(seller))
      .send({ kind: 'serviciu', title: 'Meditații la programare', price: 60, priceUnit: 'oră' })
      .expect(201);

    const services = await agent.get('/api/v1/listings?kind=serviciu').expect(200);
    expect(services.body.meta.total).toBe(1);
    expect(services.body.data[0].priceUnit).toBe('oră');
  });

  it('refuses a contact request on your own listing', async () => {
    const res = await agent
      .post(`/api/v1/listings/${listingId}/requests`)
      .set(as(seller))
      .send({})
      .expect(400);
    expect(res.body.error.code).toBe('bad_request');
  });

  it('sends a contact request and notifies the owner', async () => {
    await agent
      .post(`/api/v1/listings/${listingId}/requests`)
      .set(as(buyer))
      .send({ message: 'Mai e disponibil?' })
      .expect(201);

    const owner = await prisma.user.findUniqueOrThrow({ where: { email: seller } });
    const notifications = await prisma.notification.findMany({ where: { userId: owner.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.type).toBe('listing_request');

    const seen = await agent.get(`/api/v1/listings/${listingId}`).set(as(buyer)).expect(200);
    expect(seen.body.data.myRequestStatus).toBe('pending');
  });

  it('refuses a second request for the same listing', async () => {
    const res = await agent
      .post(`/api/v1/listings/${listingId}/requests`)
      .set(as(buyer))
      .send({})
      .expect(409);
    expect(res.body.error.code).toBe('conflict');
  });

  it('lets only the owner answer a request', async () => {
    const list = await agent.get('/api/v1/listings/requests').set(as(seller)).expect(200);
    expect(list.body.data.received).toHaveLength(1);
    requestId = list.body.data.received[0].id;

    await agent
      .patch(`/api/v1/requests/${requestId}`)
      .set(as(buyer))
      .send({ status: 'accepted' })
      .expect(403);

    await agent
      .patch(`/api/v1/requests/${requestId}`)
      .set(as(seller))
      .send({ status: 'accepted' })
      .expect(200);

    const asker = await prisma.user.findUniqueOrThrow({ where: { email: buyer } });
    const answered = await prisma.notification.findMany({
      where: { userId: asker.id, type: 'listing_request_answered' },
    });
    expect(answered).toHaveLength(1);
  });

  it('refuses to edit a listing that is not yours', async () => {
    const res = await agent
      .patch(`/api/v1/listings/${listingId}`)
      .set(as(buyer))
      .send({ status: 'inchis' })
      .expect(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('closes a listing and stops new requests', async () => {
    await agent
      .patch(`/api/v1/listings/${listingId}`)
      .set(as(seller))
      .send({ status: 'inchis' })
      .expect(200);

    await prisma.listingRequest.deleteMany({ where: { listingId } });
    const res = await agent
      .post(`/api/v1/listings/${listingId}/requests`)
      .set(as(buyer))
      .send({})
      .expect(409);
    expect(res.body.error.message).toContain('închis');
  });

  it('never exposes an email address', async () => {
    const list = await agent.get('/api/v1/listings').set(as(buyer)).expect(200);
    expect(JSON.stringify(list.body)).not.toContain('@student.tuiasi.ro');
  });
});
