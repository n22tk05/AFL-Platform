/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep production verification separate from a running development server.
  distDir: process.env.AFL_BUILD_DIR || '.next',
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/admin/library",
        destination: "/library",
      },
      {
        source: "/admin/review/:id",
        destination: "/review/:id",
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
