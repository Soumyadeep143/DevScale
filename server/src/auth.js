import { createRemoteJWKSet, jwtVerify } from 'jose';

// Checks a Clerk session token WITHOUT any secret: the signature is verified against Clerk's public keys
// (the JWKS at <issuer>/.well-known/jwks.json), and the issuer, expiry and (when present) the authorised
// party must all be right. `jwks` can be replaced in tests.
export function makeVerifier({ issuer, origins = [], jwks }) {
  const keys = jwks || createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return async function verify(token) {
    const { payload } = await jwtVerify(token, keys, { issuer, clockTolerance: 5 });
    if (!payload.sub) throw new Error('Token has no subject.');
    // Clerk puts the page's origin in `azp`: a token minted for some other site is refused.
    if (payload.azp && origins.length && !origins.includes(String(payload.azp).replace(/\/$/, ''))) {
      throw new Error('Token was issued for a different site.');
    }
    return payload;
  };
}

export const bearer = (header) => /^Bearer\s+(\S+)$/i.exec(String(header || ''))?.[1] || '';
