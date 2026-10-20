/**
 * Página de login para el panel administrativo.
 *
 * Autentica con email/contraseña (SDK cliente) y exige el custom claim
 * `rol: 'admin'`. Si es válido redirige a /panel; si no, cierra la sesión
 * y muestra el error.
 */

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/router';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function LoginPage() {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Si ya hay sesión de admin, ir directo al panel.
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      user
        .getIdTokenResult()
        .then((tokenResult) => {
          const claims = tokenResult.claims as Record<string, unknown>;
          if (claims['rol'] === 'admin') {
            void router.replace('/panel');
          } else {
            signOut(auth).finally(() => {
              setError('Acceso solo para administradores.');
            });
          }
        })
        .catch(() => {
          // Sesión sin claims legibles: se queda en el login.
        });
    });

    return () => unsub();
  }, [router]);

  const manejarLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const cred = await signInWithEmailAndPassword(
        auth,
        correo.trim(),
        password,
      );
      const tokenResult = await cred.user.getIdTokenResult(true);
      const claims = tokenResult.claims as Record<string, unknown>;
      if (claims['rol'] !== 'admin') {
        await signOut(auth);
        setError('Acceso solo para administradores.');
        return;
      }
      await router.replace('/panel');
    } catch {
      setError('Correo o contraseña incorrectos.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white py-12 px-4 sm:px-8">
      <div className="max-w-md mx-auto w-full">
        <div className="bg-white rounded-xl shadow-lg p-8 sm:p-10">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-6">
            Inicio de sesión administrador
          </h2>

          {error && (
            <div className="rounded border border-red-500 bg-red-100 p-3 mb-4 text-sm text-red-800">
              {error}
            </div>
          )}

          <form onSubmit={manejarLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Correo electrónico
              </label>
              <input
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="admin@rutaudea.edu.co"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={cargando}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {cargando ? 'Verificando…' : 'Ingresar al panel'}
            </button>
          </form>

          <div className="mt-4 text-center text-sm">
            <a
              href="https://rutaudea.edu.co"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline"
            >
              Universidad de Antioquia
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
