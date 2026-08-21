import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/db.js';
import { config } from '../src/config.js';
import { anonymize, signInWithSso } from '../src/modules/auth/service.js';

const dbUp = await prisma
  .$queryRaw`SELECT 1`.then(() => true)
  .catch(() => false);

if (!dbUp) {
  console.warn('skipping SSO tests: no database at DATABASE_URL');
}

// the token exchange itself needs microsoft what is testable is what we do with the claims
describe.skipIf(!dbUp)('institutional sign in', () => {
  const claims = {
    subject: 'entra-subject-aaa',
    email: 'ana.popa@student.tuiasi.ro',
    name: 'Ana Popa',
  };

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE faculties, users, user_sessions RESTART IDENTITY CASCADE',
    );
    await prisma.$executeRaw`
      INSERT INTO faculties (id, name, short_name) VALUES (${config.facultyId}, 'Test', 'TST')`;
    await prisma.$executeRaw`SELECT setval('faculties_id_seq', ${config.facultyId})`;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
  });

  it('refuses an address outside the faculty', async () => {
    await expect(signInWithSso({ ...claims, email: 'cineva@gmail.com' })).rejects.toThrow(
      /nu aparține facultății/,
    );
    expect(await prisma.user.count()).toBe(0);
  });

  it('creates an account on the first sign in and marks it new', async () => {
    const { user, isNew } = await signInWithSso(claims);

    expect(isNew).toBe(true);
    expect(user.email).toBe(claims.email);
    expect(user.displayName).toBe('Ana Popa');
    // nothing about the group comes from the university so the profile step is unavoidable
    expect(user.groupId).toBeNull();

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.ssoSubject).toBe(claims.subject);
    expect(row.passwordHash).toBeNull();
    expect(row.emailVerified).toBe(true);
  });

  it('signs the same person back into the same account', async () => {
    const first = await signInWithSso(claims);
    const second = await signInWithSso(claims);

    expect(second.isNew).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    expect(await prisma.user.count()).toBe(1);
  });

  it('links onto an account that already existed with a password', async () => {
    const existing = await prisma.user.create({
      data: {
        displayName: 'Ana P.',
        email: claims.email,
        passwordHash: 'argon2-placeholder',
        facultyId: config.facultyId,
      },
      select: { id: true },
    });

    const { user, isNew } = await signInWithSso(claims);

    expect(isNew).toBe(false);
    expect(user.id).toBe(existing.id);
    // everything hanging off the account survives the link
    expect(await prisma.user.count()).toBe(1);
  });

  it('refuses to hand over a privileged account to whoever owns the address', async () => {
    await prisma.user.create({
      data: {
        displayName: 'Administrator',
        email: claims.email,
        passwordHash: 'argon2-placeholder',
        role: 'admin',
        facultyId: config.facultyId,
      },
    });

    await expect(signInWithSso(claims)).rejects.toThrow(/drepturi speciale/);
  });

  it('still signs a privileged account in once its subject is known', async () => {
    const admin = await prisma.user.create({
      data: {
        displayName: 'Administrator',
        email: claims.email,
        ssoSubject: claims.subject,
        role: 'admin',
        authProvider: 'sso',
        facultyId: config.facultyId,
      },
      select: { id: true },
    });

    const { user } = await signInWithSso(claims);
    expect(user.id).toBe(admin.id);
    expect(user.role).toBe('admin');
  });

  it('follows the subject when the university changes the address', async () => {
    const first = await signInWithSso(claims);
    const renamed = await signInWithSso({ ...claims, email: 'ana.popescu@student.tuiasi.ro' });

    expect(renamed.user.id).toBe(first.user.id);
    expect(renamed.user.email).toBe('ana.popescu@student.tuiasi.ro');
    expect(await prisma.user.count()).toBe(1);
  });

  it('refuses a banned account', async () => {
    const { user } = await signInWithSso(claims);
    await prisma.user.update({ where: { id: user.id }, data: { isBanned: true } });

    await expect(signInWithSso(claims)).rejects.toThrow(/suspendat/);
  });

  it('does not walk back into an anonymised account', async () => {
    const { user } = await signInWithSso(claims);
    await anonymize(user.id);

    const again = await signInWithSso(claims);

    expect(again.isNew).toBe(true);
    expect(again.user.id).not.toBe(user.id);
  });
});
