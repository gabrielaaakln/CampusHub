import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { norm, normCompact } from '@campushub/shared';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/lib/db.js';

const dbUp = await prisma
  .$queryRaw`SELECT 1`.then(() => true)
  .catch(() => false);

if (!dbUp) console.warn('skipping map tests: no database at DATABASE_URL');

describe.skipIf(!dbUp)('map', () => {
  const app = createApp();
  let buildingId = 0;
  let floorId = 0;
  let roomId = 0;

  beforeAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE faculties RESTART IDENTITY CASCADE');
    await prisma.$executeRaw`
      INSERT INTO faculties (id, name, short_name) VALUES (${config.facultyId}, 'Test', 'TST')`;
    await prisma.$executeRaw`SELECT setval('faculties_id_seq', ${config.facultyId})`;

    const building = await prisma.building.create({
      data: {
        facultyId: config.facultyId,
        name: 'Corp AC',
        code: 'AC',
        latitude: 47.15531,
        longitude: 27.60112,
        entranceLat: 47.15519,
        entranceLng: 27.60098,
        floors: { create: [{ level: 1, label: 'Etaj 1' }] },
      },
      include: { floors: true },
    });
    buildingId = building.id;
    floorId = building.floors[0]!.id;

    const room = await prisma.room.create({
      data: {
        floorId,
        roomNumber: 'AC1-7',
        roomNumberNorm: normCompact('AC1-7'),
        roomType: 'laborator',
        directions: 'Corp AC, Etaj 1, pe stânga după scări',
        aliases: {
          create: [{ alias: 'lab Rețele de calculatoare', aliasNorm: norm('lab Rețele de calculatoare') }],
        },
      },
    });
    roomId = room.id;

    await prisma.room.create({
      data: {
        floorId,
        roomNumber: 'AC1-8',
        roomNumberNorm: normCompact('AC1-8'),
        roomType: 'curs',
      },
    });
  });

  it('lists the buildings with their room counts', async () => {
    const res = await request(app).get('/api/v1/buildings').expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ name: 'Corp AC', floorCount: 1, roomCount: 2 });
  });

  it('lists floors and the rooms on a floor', async () => {
    const floors = await request(app).get(`/api/v1/buildings/${buildingId}/floors`).expect(200);
    expect(floors.body.data[0]).toMatchObject({ level: 1, label: 'Etaj 1', roomCount: 2 });

    const rooms = await request(app).get(`/api/v1/floors/${floorId}/rooms`).expect(200);
    expect(rooms.body.data.map((r: { number: string }) => r.number)).toEqual(['AC1-7', 'AC1-8']);
  });

  it('finds a room by number written without the separator', async () => {
    const res = await request(app).get('/api/v1/rooms/search?q=ac17').expect(200);
    expect(res.body.data[0].number).toBe('AC1-7');
  });

  it('finds a room by what happens in it, without diacritics and with a typo', async () => {
    const res = await request(app).get('/api/v1/rooms/search?q=lab retele').expect(200);
    expect(res.body.data[0].number).toBe('AC1-7');
    expect(res.body.data[0].directions).toContain('Etaj 1');
  });

  it('answers with an empty list instead of an error when nothing matches', async () => {
    const res = await request(app).get('/api/v1/rooms/search?q=piscina%20olimpica').expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('rejects a search without a query', async () => {
    const res = await request(app).get('/api/v1/rooms/search').expect(422);
    expect(res.body.error.code).toBe('validation_failed');
  });

  it('returns the room sheet with building, floor and directions', async () => {
    const res = await request(app).get(`/api/v1/rooms/${roomId}`).expect(200);
    expect(res.body.data).toMatchObject({
      number: 'AC1-7',
      roomType: 'laborator',
      floor: { level: 1, label: 'Etaj 1' },
      building: { name: 'Corp AC' },
      classes: [],
    });
    expect(res.body.data.aliases).toContain('lab Rețele de calculatoare');
  });

  it('hides the floorplan fields while the flag is off', async () => {
    const res = await request(app).get(`/api/v1/rooms/${roomId}`).expect(200);
    expect(res.body.data).not.toHaveProperty('svgElementId');
  });

  it('answers 404 for a room in another faculty', async () => {
    const res = await request(app).get('/api/v1/rooms/999999').expect(404);
    expect(res.body.error.code).toBe('not_found');
  });
});
