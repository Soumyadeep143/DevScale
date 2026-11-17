import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';

export const ISSUER = 'https://divine-pigeon-26.clerk.accounts.dev';
export const ORIGIN = 'http://localhost:5173';

// Real keys and real signed tokens, so the sign-in check is tested for real.
export async function makeKeys() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const other = await generateKeyPair('RS256');
  return { privateKey, otherPrivateKey: other.privateKey, jwks: createLocalJWKSet({ keys: [jwk] }) };
}

export async function sign(key, { sub = 'user_1', issuer = ISSUER, azp = ORIGIN, exp = '5m', kid = 'test-key' } = {}) {
  const jwt = new SignJWT({ ...(azp ? { azp } : {}) }).setProtectedHeader({ alg: 'RS256', kid }).setIssuer(issuer).setIssuedAt();
  if (sub) jwt.setSubject(sub);
  jwt.setExpirationTime(exp);
  return jwt.sign(key);
}

export const baseConfig = (over = {}) => ({ port: 0, groqKey: 'k', groqBase: 'https://api.test/v1', model: 'm', origins: [ORIGIN], issuer: ISSUER, ratePerMinute: 100, ...over });

export function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) }));
  });
}
