// Pure OAuth2 URL / request-body builders shared by both providers (RFC 6749 + PKCE).
// No Electron — unit-testable. The provider modules supply `config` (endpoints, scope,
// clientId) and any provider-specific extra auth params (e.g. Google access_type).

export function buildAuthUrl(config, { redirectUri, codeChallenge, state, extra = {} }) {
  const p = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: config.scope,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    ...extra,
  });
  return `${config.authUrl}?${p.toString()}`;
}

export function tokenRequestBody({ config, code, codeVerifier, redirectUri }) {
  const p = new URLSearchParams({
    client_id: config.clientId,
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });
  // Google "Desktop app" clients require the (non-confidential) secret; Microsoft must not
  // send one (public client). Only set it when the provider config carries one.
  if (config.clientSecret) p.set('client_secret', config.clientSecret);
  return p.toString();
}

export function refreshRequestBody({ config, refreshToken }) {
  const p = new URLSearchParams({
    client_id: config.clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: config.scope, // optional for Google, expected by Microsoft
  });
  if (config.clientSecret) p.set('client_secret', config.clientSecret);
  return p.toString();
}
