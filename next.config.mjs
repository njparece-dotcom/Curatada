/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      // Proxy /uploads/* to the dynamic file-serve API route so that
      // runtime-uploaded files (not in the build manifest) are served correctly
      // in Next.js standalone mode.
      {
        source: "/uploads/:path*",
        destination: "/api/uploads/:path*",
      },
      // Apple App Site Association (AASA) for the Vault 1 iOS app's
      // Universal Links. Apple requires the file at
      // `/.well-known/apple-app-site-association` with NO `.json`
      // extension and `Content-Type: application/json`. Next App Router
      // doesn't love dot-prefixed segment names (`.well-known/...`), so
      // we serve from `/api/aasa` and rewrite the public URL here.
      {
        source: "/.well-known/apple-app-site-association",
        destination: "/api/aasa",
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
  },
  // Renamed in Next 15: experimental.serverComponentsExternalPackages -> serverExternalPackages.
  //
  // - `pg`: native Postgres driver. Bundling breaks the cnative addon path.
  // - `@tensorflow/tfjs` + `nsfwjs`: webpack chokes minifying the TF.js
  //   bundle (`WebpackError is not a constructor` from minify-webpack-plugin).
  //   These are server-only (imported from lib/moderation/nsfw.ts which is
  //   only reached via API routes), so externalising them is safe and
  //   produces a smaller build.
  // - `sharp`: native libvips addon — must not be bundled.
  serverExternalPackages: ["pg", "@tensorflow/tfjs", "nsfwjs", "sharp"],
};

export default nextConfig;
