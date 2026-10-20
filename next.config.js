/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  pageExtensions: ['ts', 'tsx', 'js', 'jsx'],
  // Si necesitas omitir ESLint durante el build en Next.js 16+, se hace vía CLI 
  // o configurando la propiedad typescript si aplica, eliminando la clave no soportada.
};

export default nextConfig;