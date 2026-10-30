/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  pageExtensions: ['ts', 'tsx', 'js', 'jsx'],
  // Externalizar módulos ESM (jose) que jwks-rsa (CJS) intenta require() en el
  // runtime serverless de Vercel/AWS Lambda. Evita ERR_REQUIRE_ESM.
  serverExternalPackages: ['firebase-admin', 'jose', 'jwks-rsa', 'google-auth-library'],
};

export default nextConfig;
