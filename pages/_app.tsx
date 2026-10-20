/**
 * Componente raíz de Next.js (Page Router).
 * Carga los estilos globales de Tailwind para toda la app.
 */

import type { AppProps } from 'next/app';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
