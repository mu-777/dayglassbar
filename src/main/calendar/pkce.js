// PKCE + random tokens for the OAuth loopback flow (RFC 7636 / RFC 8252). Node crypto
// only — no Electron — so it is unit-testable. A public native client uses PKCE instead
// of a client secret (CLAUDE.md / docs decision: client_id only is shipped).
import crypto from 'node:crypto';

const b64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// 32 random bytes → 43-char base64url string (within the spec's 43..128 range).
export function createVerifier() {
  return b64url(crypto.randomBytes(32));
}

export function challengeFromVerifier(verifier) {
  return b64url(crypto.createHash('sha256').update(verifier).digest());
}

// Opaque random value for the `state` parameter (CSRF protection on the redirect).
export function randomToken(bytes = 16) {
  return b64url(crypto.randomBytes(bytes));
}
