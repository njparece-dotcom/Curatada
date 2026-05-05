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
  experimental: {
    serverComponentsExternalPackages: ["pg"],
  },
};

export default nextConfig;
