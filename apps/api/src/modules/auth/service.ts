import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import type { RegisterBody, SessionUser } from '@campushub/shared';
import { isAllowedEmailDomain } from '@campushub/shared';
import { config } from '../../config.js';
import { prisma } from '../../lib/db.js';
import { badRequest, conflict, unauthorized } from '../../lib/errors.js';
import { toSessionUser } from '../../middleware/auth.js';

export async function register(input: RegisterBody): Promise<SessionUser> {
  if (!isAllowedEmailDomain(input.email, config.allowedEmailDomains)) {
    throw badRequest(
      `Înregistrarea este permisă doar cu adresa instituțională (${config.allowedEmailDomains.join(', ')})`,
      { field: 'email' },
    );
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict('Există deja un cont cu această adresă', { field: 'email' });

  if (input.groupId) await assertGroupBelongsToFaculty(input.groupId);

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const created = await prisma.user.create({
    data: {
      displayName: input.displayName,
      email: input.email,
      passwordHash,
      facultyId: config.facultyId,
      groupId: input.groupId ?? null,
      subgroup: input.subgroup ?? null,
      emailVerified: !config.features.emailVerify,
    },
    select: { id: true },
  });

  const user = await toSessionUser(created.id);
  if (!user) throw new Error('user vanished right after creation');
  return user;
}

export async function verifyCredentials(email: string, password: string): Promise<SessionUser> {
  const user = await prisma.user.findUnique({ where: { email } });
  // same message and comparable cost whether the account exists or not
  if (!user?.passwordHash || user.anonymizedAt) {
    await argon2.verify(await dummyHash, password).catch(() => false);
    throw unauthorized('Email sau parolă greșită');
  }
  const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
  if (!ok) throw unauthorized('Email sau parolă greșită');
  if (user.isBanned) throw unauthorized('Cont suspendat');

  const session = await toSessionUser(user.id);
  if (!session) throw unauthorized('Cont indisponibil');
  return session;
}

/** deletion is anonymisation threads stay readable the person disappears */
export async function anonymize(userId: number): Promise<void> {
  const filler = randomBytes(12).toString('hex');
  await prisma.user.update({
    where: { id: userId },
    data: {
      displayName: 'Utilizator șters',
      email: `deleted-${filler}@invalid.local`,
      passwordHash: null,
      avatarUrl: null,
      groupId: null,
      subgroup: null,
      anonymizedAt: new Date(),
    },
  });
}

async function assertGroupBelongsToFaculty(groupId: number): Promise<void> {
  const group = await prisma.studyGroup.findUnique({
    where: { id: groupId },
    select: { facultyId: true },
  });
  if (!group || group.facultyId !== config.facultyId) {
    throw badRequest('Grupa nu există', { field: 'groupId' });
  }
}

// real hash of a throwaway value so a login for a missing account costs the same
const dummyHash = argon2.hash(randomBytes(32).toString('hex'), { type: argon2.argon2id });
