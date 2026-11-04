/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ['*.e2b.app'],
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
    localPatterns: [
      { pathname: '/images/**' },
      { pathname: '/brand/**' },
      { pathname: '/api/media/**' },
    ],
  },
};

export default nextConfig;
