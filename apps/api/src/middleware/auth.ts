import type { RequestHandler } from 'express';
import type { SessionUser, UserRole } from '@campushub/shared';
import { config } from '../config.js';
import { prisma } from '../lib/db.js';
import { forbidden, unauthorized } from '../lib/errors.js';

const ROLE_RANK: Record<UserRole, number> = { student: 0, moderator: 1, admin: 2 };

export async function toSessionUser(userId: number): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { group: { select: { name: true } } },
  });
  if (!user || user.isBanned || user.anonymizedAt) return null;
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role,
    facultyId: user.facultyId,
    groupId: user.groupId,
    groupName: user.group?.name ?? null,
    subgroup: user.subgroup,
    avatarUrl: user.avatarUrl,
  };
}

/** hydrates req user from the session never rejects */
export const loadUser: RequestHandler = async (req, _res, next) => {
  const userId = req.session?.userId;
  if (!userId) return next();
  const user = await toSessionUser(userId);
  if (!user) {
    req.session.destroy(() => next());
    return;
  }
  req.user = user;
  next();
};

// impersonation for development only config ts refuses to boot with DEV_LOGIN in production
export const devLogin: RequestHandler = async (req, _res, next) => {
  if (!config.devLogin || req.user) return next();
  const header = req.get('x-dev-user');
  if (!header) return next();
  const id = Number(header);
  const user = Number.isFinite(id)
    ? await toSessionUser(id)
    : await prisma.user
        .findUnique({ where: { email: header }, select: { id: true } })
        .then((u) => (u ? toSessionUser(u.id) : null));
  if (user) req.user = user;
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) throw unauthorized();
  next();
};

export function requireRole(role: UserRole): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (ROLE_RANK[req.user.role] < ROLE_RANK[role]) throw forbidden();
    next();
  };
}
