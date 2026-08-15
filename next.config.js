/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost', 'mytoolbox.vercel.app'],
  },
  // Remove experimental.appDir - it's now default
  reactStrictMode: true,
  swcMinify: true,
  // If you need API rewrites
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.NEXT_PUBLIC_API_URL 
          ? `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`
          : 'http://localhost:5000/api/:path*',
      },
    ];
  },
}

module.exports = nextConfig
