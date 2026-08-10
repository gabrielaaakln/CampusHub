import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { AppServerConfig } from '../src/config.js';

/**
 * config ts reads process env once at import time so every case needs a fresh module graph
 * nothing here touches the database it is the boot decisions that are under test
 */
async function loadConfig(env: Record<string, string>): Promise<AppServerConfig> {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const mod = await import('../src/config.js');
  return mod.config;
}

const PROD = {
  NODE_ENV: 'production',
  SESSION_SECRET: 'a-secret-that-is-comfortably-longer-than-thirty-two-characters',
  DEV_LOGIN: 'false',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('feature flags at boot', () => {
  it('leaves registration open outside production', async () => {
    const config = await loadConfig({ NODE_ENV: 'development', FEATURE_REGISTRATION: '' });
    expect(config.features.registration).toBe(true);
  });

  // nothing proves the address belongs to the person until emailVerify exists
  it('closes registration in production unless it is asked for by name', async () => {
    const off = await loadConfig({ ...PROD, FEATURE_REGISTRATION: '' });
    expect(off.features.registration).toBe(false);
    expect(off.features.passwordLogin).toBe(true);

    const on = await loadConfig({ ...PROD, FEATURE_REGISTRATION: 'true' });
    expect(on.features.registration).toBe(true);
  });

  it('cannot have a registration form without the password form behind it', async () => {
    const config = await loadConfig({
      NODE_ENV: 'development',
      FEATURE_REGISTRATION: 'true',
      FEATURE_PASSWORD_LOGIN: 'false',
      FEATURE_SSO: 'true',
      AZURE_CLIENT_ID: 'client',
      AZURE_CLIENT_SECRET: 'secret',
    });
    expect(config.features.registration).toBe(false);
  });

  it('refuses to boot with mock auth in production', async () => {
    await expect(loadConfig({ ...PROD, DEV_LOGIN: 'true' })).rejects.toThrow(/DEV_LOGIN/);
  });

  it('refuses a production session secret that is too short', async () => {
    await expect(loadConfig({ ...PROD, SESSION_SECRET: 'short' })).rejects.toThrow(
      /SESSION_SECRET/,
    );
  });

  it('refuses institutional sign in that is only half wired', async () => {
    await expect(
      loadConfig({ ...PROD, FEATURE_SSO: 'true', AZURE_CLIENT_ID: '', AZURE_CLIENT_SECRET: '' }),
    ).rejects.toThrow(/AZURE_CLIENT_ID/);
  });

  it('refuses a build with no way in at all', async () => {
    await expect(
      loadConfig({ ...PROD, FEATURE_SSO: 'false', FEATURE_PASSWORD_LOGIN: 'false' }),
    ).rejects.toThrow(/no way in/);
  });

  it('does not trust the cloudflare header unless it is turned on', async () => {
    const config = await loadConfig({ NODE_ENV: 'development' });
    expect(config.trustCloudflareHeader).toBe(false);
  });
});

describe('the registration route follows the flag', () => {
  /** a flag that only hides a button is decoration the route itself has to disappear */
  async function appWith(env: Record<string, string>) {
    vi.resetModules();
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const { createApp } = await import('../src/app.js');
    return createApp();
  }

  /** csrf runs before the routers so without a token every answer is 403 and proves nothing */
  async function post(env: Record<string, string>) {
    const agent = request.agent(await appWith(env));
    const csrf = await agent.get('/api/v1/csrf');
    return agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', (csrf.body as { data: { token: string } }).data.token)
      .send({ displayName: 'X', email: 'nu-e-email', password: 'scurt' });
  }

  it('is not mounted at all with the flag off', async () => {
    expect((await post({ FEATURE_REGISTRATION: 'false' })).status).toBe(404);
  });

  // an invalid body on purpose the point is that something validates it, not that it writes a row
  it('is mounted with the flag on', async () => {
    expect((await post({ FEATURE_REGISTRATION: 'true' })).status).toBe(422);
  });
});
