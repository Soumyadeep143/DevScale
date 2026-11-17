import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issuerFromPublishableKey, missingSettings, readConfig } from '../src/config.js';
import { bearer, makeVerifier } from '../src/auth.js';
import { makeRateLimiter } from '../src/rateLimit.js';
import { ISSUER, ORIGIN, makeKeys, sign } from './helpers.js';

test('the sign-in domain is read from the Clerk publishable key', () => {
  assert.equal(issuerFromPublishableKey('pk_test_ZGl2aW5lLXBpZ2Vvbi0yNi5jbGVyay5hY2NvdW50cy5kZXYk'), ISSUER);
  assert.equal(issuerFromPublishableKey('sk_test_nope'), '');
  assert.equal(issuerFromPublishableKey('pk_test_@@@'), '');
  assert.equal(issuerFromPublishableKey(''), '');
});

test('settings: defaults, origins, and what is missing', () => {
  const c = readConfig({ GROQ_API_KEY: 'k', CLERK_PUBLISHABLE_KEY: 'pk_test_ZGl2aW5lLXBpZ2Vvbi0yNi5jbGVyay5hY2NvdW50cy5kZXYk', ALLOWED_ORIGINS: 'https://a.com/, https://b.com' });
  assert.deepEqual(c.origins, ['https://a.com', 'https://b.com']);
  assert.equal(c.port, 8787);
  assert.equal(c.model, 'openai/gpt-oss-120b');
  assert.deepEqual(missingSettings(c), []);
  assert.deepEqual(readConfig({}).origins, ['http://localhost:5173', 'http://127.0.0.1:5173']);
  assert.equal(missingSettings(readConfig({})).length, 2);
  assert.equal(readConfig({ CLERK_ISSUER: 'https://x.clerk.dev/' }).issuer, 'https://x.clerk.dev');
});

test('bearer extracts the token and nothing else', () => {
  assert.equal(bearer('Bearer abc.def'), 'abc.def');
  assert.equal(bearer('bearer abc'), 'abc');
  assert.equal(bearer('Basic abc'), '');
  assert.equal(bearer(undefined), '');
  assert.equal(bearer('Bearer a b'), '');
});

test('the sign-in check accepts a good token and refuses every bad one', async () => {
  const { privateKey, otherPrivateKey, jwks } = await makeKeys();
  const verify = makeVerifier({ issuer: ISSUER, origins: [ORIGIN], jwks });
  assert.equal((await verify(await sign(privateKey))).sub, 'user_1');
  await assert.rejects(verify(await sign(privateKey, { exp: '-1m' })), /exp/i, 'expired');
  await assert.rejects(verify(await sign(privateKey, { issuer: 'https://evil.example' })), /iss/i, 'wrong issuer');
  await assert.rejects(verify(await sign(otherPrivateKey)), undefined, 'signed with someone else\'s key');
  await assert.rejects(verify(await sign(privateKey, { sub: '' })), /subject/i, 'no subject');
  await assert.rejects(verify(await sign(privateKey, { azp: 'https://evil.example' })), /different site/, 'minted for another site');
  await assert.rejects(verify('not.a.token'));
  assert.equal((await verify(await sign(privateKey, { azp: `${ORIGIN}/` }))).sub, 'user_1'); // trailing slash tolerated
  assert.equal((await verify(await sign(privateKey, { azp: '' }))).sub, 'user_1'); // no azp claim: allowed
});

test('rate limit: allows up to the limit per person, then waits for the window', () => {
  let t = 0;
  const allow = makeRateLimiter({ limit: 3, windowMs: 1000, now: () => t });
  assert.deepEqual([1, 2, 3, 4].map(() => allow('a')), [true, true, true, false]);
  assert.equal(allow('b'), true); // someone else is unaffected
  t = 1001;
  assert.equal(allow('a'), true);
});
