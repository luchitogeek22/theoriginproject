const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const baseHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const securityHeaders = [{ key: "X-Frame-Options", value: "DENY" }, ...baseHeaders];

const embeddableHeaders = [{ key: "Content-Security-Policy", value: "frame-ancestors *" }, ...baseHeaders];

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["three"],
  async headers() {
    return [
      // The time explorer stays embeddable in every language: `/time-explorer`, `/es/time-explorer`.
      { source: "/:path((?!(?:[a-z][a-z]/)?time-explorer/?$).*)", headers: securityHeaders },
      { source: "/time-explorer", headers: embeddableHeaders },
      { source: "/:locale([a-z][a-z])/time-explorer", headers: embeddableHeaders },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
