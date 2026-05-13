import { NextResponse } from "next/server";

// Apple App Site Association (AASA) — required for Universal Links to
// open the Vault 1 iOS app when a user taps a `https://vault1.co/*` link.
//
// Apple's CDN fetches this file from
// `https://vault1.co/.well-known/apple-app-site-association` (mapped here
// via the `next.config.mjs` rewrite). It MUST be served as
// `Content-Type: application/json` with NO `.json` extension on the URL.
// The file is fetched once on app install and then re-validated
// occasionally; changes can take 24h+ to propagate.
//
// `appIDs` format: `<TeamID>.<BundleID>`. The team ID comes from the
// "Apple Developer Team ID" field in App Store Connect (also visible
// inside any current provisioning profile).
//
// `components` covers the URL paths Apple should hand to the app. `/*`
// means "every path on this domain"; we narrow later if/when web-only
// surfaces emerge that shouldn't deep-link into the app.
//
// To verify after deploy:
//   curl -i https://vault1.co/.well-known/apple-app-site-association
// Expect HTTP 200, `content-type: application/json`, and the JSON body
// below. Apple's CDN cache can be poked via
// `https://app-site-association.cdn-apple.com/a/v1/vault1.co`.

export const dynamic = "force-static"; // cacheable, body is fixed
export const revalidate = false;

const APPLE_TEAM_ID = "59AW6Y9D59"; // Nick Parece's paid Apple Developer team
const IOS_BUNDLE_ID = "com.nextideaup.vault1";

const AASA = {
  applinks: {
    details: [
      {
        appIDs: [`${APPLE_TEAM_ID}.${IOS_BUNDLE_ID}`],
        components: [{ "/": "/*" }],
      },
    ],
  },
  // No webcredentials — we don't ship shared-password autofill yet.
};

export async function GET() {
  return NextResponse.json(AASA, {
    headers: {
      // Apple recommends a short cache-control here; the CDN respects it
      // for repeat validations but the initial fetch from a fresh install
      // bypasses the cache. Keep it short so a misconfiguration can be
      // fixed quickly.
      "cache-control": "public, max-age=300",
    },
  });
}
