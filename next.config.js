/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/gh.js", destination: "/api/gh" },
        { source: "/api/desmos.js", destination: "/api/desmos" }
      ]
    };
  },
  async headers() {
    return [
      {
        source: "/files.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=300, stale-while-revalidate=1800"
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
