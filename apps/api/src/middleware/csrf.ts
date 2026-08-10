import { doubleCsrf } from 'csrf-csrf';
import { config } from '../config.js';

// csurf is archived since 2022 double submit bound to the session id
const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => config.session.secret,
  getSessionIdentifier: (req) => req.sessionID ?? '',
  cookieName: config.isProduction ? '__Host-ch.csrf' : 'ch.csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
  },
});

export { doubleCsrfProtection, generateCsrfToken };
