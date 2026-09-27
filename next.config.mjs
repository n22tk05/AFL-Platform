/** @type {import('next').NextConfig} */
const nextConfig = {
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
};

export default nextConfig;
