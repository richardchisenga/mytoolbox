/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['mytoolbox-production.up.railway.app'],
  },
  // Optional: Use standalone output for smaller builds
  output: 'standalone',
};

module.exports = nextConfig;
