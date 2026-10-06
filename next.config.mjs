/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep production verification separate from a running development server.
  distDir: process.env.AFL_BUILD_DIR || '.next',
  reactStrictMode: true,
  // Optional supported thread workers for restricted local verification.
  ...(process.env.AFL_BUILD_THREADS === '1' ? { experimental: { workerThreads: true, cpus: 1, webpackBuildWorker: false } } : {}),
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
