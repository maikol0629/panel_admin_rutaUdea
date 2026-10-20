/**
 * Página raíz (/).
 *
 * - Con sesión de admin verificada redirige a /panel.
 * - Sin sesión redirige a /auth/login.
 * - Muestra un indicador de carga mientras se resuelve la sesión.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function Root() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        void router.replace('/auth/login');
        return;
      }
      user
        .getIdTokenResult()
        .then((tokenResult) => {
          const claims = tokenResult.claims as Record<string, unknown>;
          if (claims['rol'] === 'admin') {
            void router.replace('/panel');
          } else {
            signOut(auth).finally(() => {
              void router.replace('/auth/login');
            });
          }
        })
        .catch(() => {
          void router.replace('/auth/login');
        });
    });

    return () => unsub();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-sm text-gray-500">Cargando panel administrativo…</p>
    </div>
  );
}
