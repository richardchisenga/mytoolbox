/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost', 'mytoolbox.io'],
  },
  experimental: {
    appDir: true,
  },
}

module.exports = nextConfig
