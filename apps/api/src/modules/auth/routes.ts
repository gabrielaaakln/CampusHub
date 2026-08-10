import { Router } from 'express';
import type { Request } from 'express';
import { loginBody, registerBody, updateProfileBody } from '@campushub/shared';
import { prisma } from '../../lib/db.js';
import { badRequest, unauthorized } from '../../lib/errors.js';
import { loginLimiter, writeLimiter } from '../../middleware/rateLimit.js';
import { requireAuth, toSessionUser } from '../../middleware/auth.js';
import { valid, validate } from '../../middleware/validate.js';
import { anonymize, register, verifyCredentials } from './service.js';
import { config } from '../../config.js';

export const authRouter: Router = Router();

// the password path is for the demo accounts and the tests an account is not made this way
// nothing proves the address belongs to the person until emailVerify exists so the form is only
// mounted where that is acceptable off in production by default
if (config.features.registration) {
  const registerSchemas = { body: registerBody };
  authRouter.post('/auth/register', writeLimiter, validate(registerSchemas), async (req, res) => {
    const { body } = valid<typeof registerSchemas>(req);
    const user = await register(body);
    await startSession(req, user.id);
    res.status(201).json({ data: user });
  });
}

if (config.features.passwordLogin) {
  const loginSchemas = { body: loginBody };
  authRouter.post('/auth/login', loginLimiter, validate(loginSchemas), async (req, res) => {
    const { body } = valid<typeof loginSchemas>(req);
    const user = await verifyCredentials(body.email, body.password);
    await startSession(req, user.id);
    res.json({ data: user });
  });
}

authRouter.post('/auth/logout', async (req, res) => {
  await new Promise<void>((resolve, reject) =>
    req.session.destroy((err) => (err ? reject(err) : resolve())),
  );
  res.clearCookie(config.session.cookieName, { path: '/' });
  res.status(204).end();
});

// 200 with data null for anonymous callers so am i logged in is not an error state
authRouter.get('/auth/me', (req, res) => {
  res.json({ data: req.user ?? null });
});

const profileSchemas = { body: updateProfileBody };
authRouter.patch(
  '/auth/me',
  requireAuth,
  writeLimiter,
  validate(profileSchemas),
  async (req, res) => {
    const { body } = valid<typeof profileSchemas>(req);
    const userId = req.user!.id;

    if (body.groupId) {
      const group = await prisma.studyGroup.findUnique({
        where: { id: body.groupId },
        select: { facultyId: true, subgroups: true },
      });
      if (!group || group.facultyId !== config.facultyId) {
        throw badRequest('Grupa nu există', { field: 'groupId' });
      }
      if (body.subgroup && body.subgroup > group.subgroups) {
        throw badRequest('Semigrupa nu există în această grupă', { field: 'subgroup' });
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.groupId !== undefined ? { groupId: body.groupId } : {}),
        ...(body.subgroup !== undefined ? { subgroup: body.subgroup } : {}),
      },
    });
    res.json({ data: await toSessionUser(userId) });
  },
);

authRouter.delete('/auth/me', requireAuth, writeLimiter, async (req, res) => {
  await anonymize(req.user!.id);
  await new Promise<void>((resolve, reject) =>
    req.session.destroy((err) => (err ? reject(err) : resolve())),
  );
  res.clearCookie(config.session.cookieName, { path: '/' });
  res.status(204).end();
});

/** new session id on every login so a fixated cookie is worthless */
async function startSession(req: Request, userId: number): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve())),
  );
  req.session.userId = userId;
  // the anonymous session that carried the csrf token had a short lifetime this one is a real one
  req.session.cookie.maxAge = config.session.maxAgeMs;
  await new Promise<void>((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve())),
  );
}
