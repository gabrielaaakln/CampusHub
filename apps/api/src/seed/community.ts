import argon2 from 'argon2';
import { prisma } from '../lib/db.js';

/**
 * only two accounts can be signed into with a password
 *
 * the rest of the people exist so the forum and the listings have different names on them but they
 * carry no password hash at all which verifyCredentials treats as no account there is no third way
 * in besides the institutional sign in
 */
export const DEMO_ADMIN_EMAIL = 'admin@tuiasi.ro';
export const DEMO_STUDENT_EMAIL = 'student@student.tuiasi.ro';

const MIN_DEMO_PASSWORD = 12;

/**
 * no password literal lives in this repository not even a development one
 *
 * a value written here is public the moment the repository is, and an administrator account with a
 * published password is the whole application handed over, so both come from the environment
 */
function demoPassword(variable: string): string {
  const given = process.env[variable]?.trim();
  if (!given) {
    throw new Error(
      `${variable} is not set. Demo passwords live in .env, never in the repository — see .env.example`,
    );
  }
  if (given.length < MIN_DEMO_PASSWORD) {
    throw new Error(`${variable} must be at least ${MIN_DEMO_PASSWORD} characters`);
  }
  return given;
}

/** called before the truncate: a seed that empties the database and only then complains is worse */
export function assertDemoPasswords(): void {
  demoPassword('DEMO_ADMIN_PASSWORD');
  demoPassword('DEMO_STUDENT_PASSWORD');
}

type Ids = { facultyId: number; groupIds: number[]; roomIds: number[] };

export async function seedCommunity({ facultyId, groupIds, roomIds }: Ids) {
  const hash = (plain: string) => argon2.hash(plain, { type: argon2.argon2id });
  const [adminHash, studentHash] = await Promise.all([
    hash(demoPassword('DEMO_ADMIN_PASSWORD')),
    hash(demoPassword('DEMO_STUDENT_PASSWORD')),
  ]);
  const group = (i: number) => groupIds[i % groupIds.length]!;

  const people: {
    name: string;
    email: string;
    role: 'student' | 'moderator' | 'admin';
    g: number;
    sg: number;
    /** null means the account exists as an author but nobody can sign into it */
    passwordHash: string | null;
  }[] = [
    {
      name: 'Andrei Cojocaru',
      email: DEMO_ADMIN_EMAIL,
      role: 'admin',
      g: 0,
      sg: 1,
      passwordHash: adminHash,
    },
    {
      name: 'Ana Popa',
      email: DEMO_STUDENT_EMAIL,
      role: 'student',
      g: 0,
      sg: 1,
      passwordHash: studentHash,
    },
    // admin outranks moderator so the queue is reachable without a second password
    { name: 'Maria Ursu', email: 'moderator@tuiasi.ro', role: 'moderator', g: 0, sg: 2, passwordHash: null },
    { name: 'Vlad Munteanu', email: 'vlad.munteanu@student.tuiasi.ro', role: 'student', g: 0, sg: 2, passwordHash: null },
    { name: 'Ioana Stoica', email: 'ioana.stoica@student.tuiasi.ro', role: 'student', g: 1, sg: 1, passwordHash: null },
    { name: 'Robert Năstase', email: 'robert.nastase@student.tuiasi.ro', role: 'student', g: 1, sg: 2, passwordHash: null },
    { name: 'Elena Dobre', email: 'elena.dobre@student.tuiasi.ro', role: 'student', g: 2, sg: 1, passwordHash: null },
    { name: 'Tudor Ilie', email: 'tudor.ilie@student.tuiasi.ro', role: 'student', g: 2, sg: 2, passwordHash: null },
  ];

  const users = await Promise.all(
    people.map((p) =>
      prisma.user.create({
        data: {
          displayName: p.name,
          email: p.email,
          passwordHash: p.passwordHash,
          // the database refuses a local account with no password and mock is what these are
          authProvider: p.passwordHash ? 'local' : 'mock',
          emailVerified: true,
          role: p.role,
          facultyId,
          groupId: group(p.g),
          subgroup: p.sg,
        },
      }),
    ),
  );

  return {
    users: users.length,
  };
}
