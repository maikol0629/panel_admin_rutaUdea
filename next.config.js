/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  pageExtensions: ['ts', 'tsx', 'js', 'jsx'],
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin', 'jose', 'jwks-rsa'],
  },
};

export default nextConfig; 