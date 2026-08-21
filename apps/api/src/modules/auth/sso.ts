import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../../config.js';
import { unauthorized } from '../../lib/errors.js';

/**
 * entra id sign in for the university tenant
 *
 * the app is registered in our own tenant and marked multi tenant the authority below points at
 * tuiasi so microsoft never shows an account picker for anyone else it redirects straight to the
 * university idp at sso.tuiasi.ro which is where the password is typed never here
 */

export type SsoClaims = {
  subject: string;
  email: string;
  name: string | null;
};

export type SsoHandshake = {
  url: string;
  state: string;
  verifier: string;
  nonce: string;
};

const SCOPES = 'openid profile email';

// jwks is fetched once and cached by jose it rotates keys on its own
const jwks = createRemoteJWKSet(new URL(`${config.sso.authority}/discovery/v2.0/keys`));

/** the url the browser is sent to plus the three secrets the callback has to match against */
export function beginSignIn(): SsoHandshake {
  const state = randomBytes(24).toString('base64url');
  const nonce = randomBytes(24).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  const url = new URL(`${config.sso.authority}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', config.sso.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', config.sso.redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (config.sso.domainHint) url.searchParams.set('domain_hint', config.sso.domainHint);

  return { url: url.toString(), state, verifier, nonce };
}

/** swaps the code for tokens on the back channel then reads the identity out of the id token */
export async function completeSignIn(
  code: string,
  verifier: string,
  nonce: string,
): Promise<SsoClaims> {
  const body = new URLSearchParams({
    client_id: config.sso.clientId,
    client_secret: config.sso.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.sso.redirectUri,
    code_verifier: verifier,
    scope: SCOPES,
  });

  const response = await fetch(`${config.sso.authority}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  const payload = (await response.json().catch(() => null)) as
    | { id_token?: string; error_description?: string }
    | null;

  if (!response.ok || !payload?.id_token) {
    // the description carries the AADSTS code which is the only useful part of a failure
    throw unauthorized(payload?.error_description ?? 'Microsoft nu a returnat un token');
  }

  const { payload: claims } = await jwtVerify(payload.id_token, jwks, {
    issuer: config.sso.issuer,
    audience: config.sso.clientId,
    maxTokenAge: '10 minutes',
  }).catch(() => {
    throw unauthorized('Tokenul primit de la Microsoft nu a putut fi validat');
  });

  if (claims.nonce !== nonce) throw unauthorized('Răspuns care nu aparține acestei autentificări');

  const email = pickEmail(claims);
  if (!email) throw unauthorized('Contul instituțional nu a returnat nicio adresă de email');
  if (typeof claims.sub !== 'string') throw unauthorized('Token fără identitate');

  return {
    subject: claims.sub,
    email: email.toLowerCase(),
    name: typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim() : null,
  };
}

/** entra fills email only when the account has one preferred_username is the usual carrier */
function pickEmail(claims: Record<string, unknown>): string | null {
  for (const key of ['email', 'preferred_username', 'upn']) {
    const value = claims[key];
    if (typeof value === 'string' && value.includes('@')) return value;
  }
  return null;
}
