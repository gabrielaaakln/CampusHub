import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import type { RegisterBody, SessionUser } from '@campushub/shared';
import { isAllowedEmailDomain } from '@campushub/shared';
import { config } from '../../config.js';
import { prisma } from '../../lib/db.js';
import { badRequest, conflict, unauthorized } from '../../lib/errors.js';
import { toSessionUser } from '../../middleware/auth.js';
import type { SsoClaims } from './sso.js';

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

export type SsoSignIn = { user: SessionUser; isNew: boolean };

/**
 * an identity vouched for by the university idp
 *
 * matched first on the subject claim which survives a name or email change then on the email
 * itself the email is safe to match on because it comes from the tenant that owns the domain not
 * from anything the person typed here
 */
export async function signInWithSso(claims: SsoClaims): Promise<SsoSignIn> {
  if (!isAllowedEmailDomain(claims.email, config.allowedEmailDomains)) {
    throw unauthorized(
      `Contul ${claims.email} nu aparține facultății (${config.allowedEmailDomains.join(', ')})`,
    );
  }

  const bySubject = await prisma.user.findUnique({ where: { ssoSubject: claims.subject } });
  const existing = bySubject ?? (await prisma.user.findUnique({ where: { email: claims.email } }));

  if (existing) {
    if (existing.isBanned) throw unauthorized('Cont suspendat');
    if (existing.anonymizedAt) throw unauthorized('Cont indisponibil');

    /**
     * an address alone never hands over a privileged account
     *
     * matching on email is what links a student to the account seeded for them but admin@tuiasi.ro
     * is a plausible real mailbox and owning it must not be the same as being our administrator
     * once the subject is on the account the person has already proved they are that account
     */
    if (!bySubject && existing.role !== 'student') {
      throw unauthorized(
        'Există deja un cont cu drepturi speciale pe adresa asta. Un administrator trebuie să îl lege manual.',
      );
    }

    await prisma.user.update({
      where: { id: existing.id },
      data: {
        ssoSubject: claims.subject,
        email: claims.email,
        emailVerified: true,
        // an account that arrived by password keeps it the provider says how it got in last
        authProvider: 'sso',
      },
    });

    const user = await toSessionUser(existing.id);
    if (!user) throw unauthorized('Cont indisponibil');
    return { user, isNew: false };
  }

  const created = await prisma.user.create({
    data: {
      // the idp knows the legal name the display name is the student's to change in the profile
      displayName: claims.name ?? claims.email.split('@')[0] ?? 'Student',
      email: claims.email,
      ssoSubject: claims.subject,
      authProvider: 'sso',
      emailVerified: true,
      passwordHash: null,
      facultyId: config.facultyId,
    },
    select: { id: true },
  });

  const user = await toSessionUser(created.id);
  if (!user) throw new Error('user vanished right after creation');
  return { user, isNew: true };
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
      // without this the next institutional sign in would walk straight back into the dead account
      ssoSubject: null,
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
