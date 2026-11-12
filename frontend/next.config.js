/** @type {import('next').NextConfig} */
const baseHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const securityHeaders = [{ key: "X-Frame-Options", value: "DENY" }, ...baseHeaders];

const embeddableHeaders = [{ key: "Content-Security-Policy", value: "frame-ancestors *" }, ...baseHeaders];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["three"],
  async headers() {
    return [
      { source: "/:path((?!time-explorer/?$).*)", headers: securityHeaders },
      { source: "/time-explorer", headers: embeddableHeaders },
    ];
  },
};

module.exports = nextConfig;
