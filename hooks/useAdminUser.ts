/**
 * Hook compartido para el estado de autenticación del panel admin.
 *
 * Escucha la sesión del SDK cliente y expone el custom claim `rol`
 * y el ID token vigente para llamar a las API Routes protegidas.
 */

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export interface AdminUserState {
  firebaseUser: User | null;
  /** Custom claim `rol` del ID token (`'admin'` u otro). */
  rol: string | null;
  /** ID token vigente para el header `Authorization: Bearer`. */
  idToken: string | null;
  loading: boolean;
}

export function useAdminUser(): AdminUserState {
  const [state, setState] = useState<AdminUserState>({
    firebaseUser: null,
    rol: null,
    idToken: null,
    loading: true,
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setState({ firebaseUser: null, rol: null, idToken: null, loading: false });
        return;
      }
      firebaseUser
        .getIdTokenResult()
        .then((tokenResult) => {
          const claims = tokenResult.claims as Record<string, unknown>;
          setState({
            firebaseUser,
            rol: typeof claims['rol'] === 'string' ? claims['rol'] : null,
            idToken: tokenResult.token,
            loading: false,
          });
        })
        .catch(() => {
          setState({ firebaseUser, rol: null, idToken: null, loading: false });
        });
    });
    return () => unsub();
  }, []);

  return state;
}
