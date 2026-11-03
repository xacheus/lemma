/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  images: {
    // All photography is served from /public — no remote image hosts are configured.
    localPatterns: [{ pathname: '/images/**' }],
  },
};

export default nextConfig;
