import { Router } from 'express';
import type { Request } from 'express';
import { loginBody, registerBody, updateProfileBody } from '@campushub/shared';
import { prisma } from '../../lib/db.js';
import { badRequest, unauthorized } from '../../lib/errors.js';
import { loginLimiter, writeLimiter } from '../../middleware/rateLimit.js';
import { requireAuth, toSessionUser } from '../../middleware/auth.js';
import { valid, validate } from '../../middleware/validate.js';
import { anonymize, register, signInWithSso, verifyCredentials } from './service.js';
import { beginSignIn, completeSignIn } from './sso.js';
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

if (config.features.sso) {
  // a plain redirect not json the browser is the one travelling
  authRouter.get('/auth/sso/start', loginLimiter, async (req, res) => {
    const handshake = beginSignIn();
    req.session.ssoState = handshake.state;
    req.session.ssoVerifier = handshake.verifier;
    req.session.ssoNonce = handshake.nonce;
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve())),
    );
    res.redirect(handshake.url);
  });

  authRouter.get('/auth/sso/callback', loginLimiter, async (req, res) => {
    const { state, verifier, nonce } = takeHandshake(req);
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const returned = typeof req.query.state === 'string' ? req.query.state : null;

    // microsoft reports a refused consent here rather than by failing the token call
    if (typeof req.query.error === 'string') {
      const description =
        typeof req.query.error_description === 'string'
          ? req.query.error_description
          : req.query.error;
      return res.redirect(failure(description));
    }
    if (!code || !state || !returned || returned !== state || !verifier || !nonce) {
      return res.redirect(failure('Autentificarea a expirat sau a fost pornită în altă filă'));
    }

    try {
      const claims = await completeSignIn(code, verifier, nonce);
      const { user, isNew } = await signInWithSso(claims);
      await startSession(req, user.id);
      // a fresh account has no group so it lands where it can pick one
      res.redirect(isNew || !user.groupId ? '/profil?bun-venit=1' : '/');
    } catch (err) {
      res.redirect(failure(err instanceof Error ? err.message : 'Autentificare eșuată'));
    }
  });
} else {
  authRouter.get('/auth/sso/start', () => {
    throw unauthorized('Autentificarea instituțională nu este pornită');
  });
}

/** the handshake is single use so it leaves the session whether it matched or not */
function takeHandshake(req: Request): { state?: string; verifier?: string; nonce?: string } {
  const { ssoState: state, ssoVerifier: verifier, ssoNonce: nonce } = req.session;
  delete req.session.ssoState;
  delete req.session.ssoVerifier;
  delete req.session.ssoNonce;
  return { state, verifier, nonce };
}

/** the message lands back in the address bar so it stays short and encoded */
function failure(message: string): string {
  return `/intra?eroare=${encodeURIComponent(message.slice(0, 200))}`;
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
