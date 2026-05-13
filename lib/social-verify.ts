import { createRemoteJWKSet, jwtVerify } from "jose";

// Verifies an OAuth provider's ID token signature and standard claims (iss,
// aud, exp). Used by /api/auth/social to authenticate a native Apple or
// Google sign-in without the OAuth redirect dance.
//
// The expected audience varies by client:
//   - Apple iOS: the app's bundle ID (e.g. com.nextideaup.vault1)
//   - Apple Web: the Services ID (already in APPLE_ID)
//   - Google iOS: the iOS OAuth client ID from the Google console
// `expectedAudiences` therefore accepts either a single value or a list,
// and we accept the token if its `aud` matches any of them.

export interface VerifiedIdentity {
  sub: string;             // provider's stable user id
  email: string | null;    // may be hidden for Apple "Hide my email"
  name: string | null;     // Apple only sends this on the FIRST sign-in
  emailVerified: boolean;
}

const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

// Single cached JWKS per provider — `createRemoteJWKSet` handles fetch +
// caching internally. Module-level so the cache survives across requests.
const appleJwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

interface VerifyOpts {
  provider: "apple" | "google";
  idToken: string;
  expectedAudiences: string | string[];
}

export async function verifyIdToken(opts: VerifyOpts): Promise<VerifiedIdentity> {
  const audiences = Array.isArray(opts.expectedAudiences) ? opts.expectedAudiences : [opts.expectedAudiences];
  if (audiences.length === 0) throw new Error("expectedAudiences must be non-empty");

  const issuer = opts.provider === "apple" ? "https://appleid.apple.com" : "https://accounts.google.com";
  const jwks = opts.provider === "apple" ? appleJwks : googleJwks;

  const { payload } = await jwtVerify(opts.idToken, jwks, {
    issuer: opts.provider === "google"
      // Google's `iss` is one of these two strings.
      ? ["https://accounts.google.com", "accounts.google.com"]
      : issuer,
    audience: audiences,
  });

  if (typeof payload.sub !== "string") throw new Error("ID token missing sub claim");

  const email = typeof payload.email === "string" ? payload.email : null;
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";

  // Name: Google ships `name`; Apple only ships a `name` object in the
  // initial form-post (NOT inside the id_token). The native client must
  // forward Apple's first-sign-in name out-of-band — see /api/auth/social.
  const name = typeof payload.name === "string" ? payload.name : null;

  return { sub: payload.sub, email, name, emailVerified };
}
