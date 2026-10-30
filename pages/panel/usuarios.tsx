/**
 * Página de gestión de usuarios y roles (solo superadmin).
 *
 * Permite listar usuarios del panel, asignar rol (admin / superadmin),
 * deshabilitar o reactivar cuentas. Es el punto de entrada para el
 * módulo de superadmin (Fase 9, punto 4).
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAdminUser } from '@/hooks/useAdminUser';
import AdminLayout from '@/components/layout/AdminLayout';

interface UsuarioRow {
  uid: string;
  correo: string | null;
  nombre: string | null;
  rol: string;
  estado: string;
  fechaCreacion?: string;
  proveedor?: string;
}

export default function UsuariosPage() {
  const router = useRouter();
  const { idToken } = useAdminUser();
  const [usuario, setUsuario] = useState<User | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        void router.replace('/auth/login');
        return;
      }
      setUsuario(user);
      user
        .getIdTokenResult()
        .then((tokenResult) => {
          const claims = tokenResult.claims as Record<string, unknown>;
          if (claims['rol'] !== 'superadmin') {
            signOut(auth).finally(() => {
              void router.replace('/panel');
            });
          }
        })
        .catch(() => {
          void router.replace('/auth/login');
        });
    });
    return () => unsub();
  }, [router]);

  const cargarUsuarios = useCallback(async () => {
    if (!idToken) return;
    setCargando(true);
    try {
      const r = await fetch('/api/usuarios', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error al cargar usuarios');
      setUsuarios(data.usuarios ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setCargando(false);
    }
  }, [idToken]);

  useEffect(() => {
    cargarUsuarios();
  }, [cargarUsuarios]);

  const rolOptions = ['aspirante', 'admin', 'superadmin'] as const;
  const estadoOptions = ['activo', 'deshabilitado'] as const;

  const actualizarUsuario = async (
    uid: string,
    campo: 'rol' | 'estado',
    valor: string,
  ) => {
    setGuardando((prev) => new Set([...prev, uid]));
    try {
      const r = await fetch('/api/usuarios', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${idToken ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uid, [campo]: valor }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error al actualizar');
      setUsuarios((prev) =>
        prev.map((u) =>
          u.uid === uid ? { ...u, [campo]: valor } : u,
        ),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al actualizar usuario');
    } finally {
      setGuardando((prev) => {
        const siguiente = new Set(prev);
        siguiente.delete(uid);
        return siguiente;
      });
    }
  };

  const deshabilitarUsuario = async (uid: string) => {
    if (!confirm('¿Deshabilitar este usuario? No podrá iniciar sesión.')) return;
    setGuardando((prev) => new Set([...prev, uid]));
    try {
      const r = await fetch('/api/usuarios', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${idToken ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uid }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error al deshabilitar');
      setUsuarios((prev) =>
        prev.map((u) =>
          u.uid === uid ? { ...u, estado: 'deshabilitado' } : u,
        ),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al deshabilitar usuario');
    } finally {
      setGuardando((prev) => {
        const siguiente = new Set(prev);
        siguiente.delete(uid);
        return siguiente;
      });
    }
  };

  if (!idToken) return null;

  return (
    <AdminLayout
      title="Usuarios y roles"
      subtitle="Gestión de administradores del panel (solo superadmin)"
      user={usuario}
      maxWidth="7xl"
    >
      <h1 className="text-3xl font-bold text-gray-900 mb-6">
        Usuarios y roles
      </h1>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 flex items-center gap-2">
        <button
          onClick={cargarUsuarios}
          disabled={cargando}
          className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
        >
          {cargando ? 'Cargando…' : 'Refrescar'}
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="px-6 py-3 font-medium">Correo</th>
              <th className="px-6 py-3 font-medium">Nombre</th>
              <th className="px-6 py-3 font-medium">Rol</th>
              <th className="px-6 py-3 font-medium">Estado</th>
              <th className="px-6 py-3 font-medium">Proveedor</th>
              <th className="px-6 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.uid} className="border-b border-slate-100">
                <td className="px-6 py-3">
                  <span className="text-slate-900">{u.correo}</span>
                </td>
                <td className="px-6 py-3">
                  <span className="text-slate-600">{u.nombre ?? '—'}</span>
                </td>
                <td className="px-6 py-3">
                  <select
                    value={u.rol}
                    disabled={guardando.has(u.uid)}
                    onChange={(e) =>
                      actualizarUsuario(u.uid, 'rol', e.target.value)
                    }
                    className="px-2 py-1.5 rounded border border-slate-300 text-sm bg-white disabled:opacity-50"
                  >
                    {rolOptions.map((r) => (
                      <option key={r} value={r}>
                        {r === 'superadmin' ? 'Superadmin' : r === 'admin' ? 'Admin' : 'Aspirante'}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-6 py-3">
                  <select
                    value={u.estado}
                    disabled={guardando.has(u.uid)}
                    onChange={(e) =>
                      actualizarUsuario(u.uid, 'estado', e.target.value)
                    }
                    className="px-2 py-1.5 rounded border border-slate-300 text-sm bg-white disabled:opacity-50"
                  >
                    {estadoOptions.map((e) => (
                      <option key={e} value={e}>
                        {e === 'activo' ? 'Activo' : 'Deshabilitado'}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-6 py-3 text-slate-600">
                  {u.proveedor ?? '—'}
                </td>
                <td className="px-6 py-3">
                  {u.uid === (usuario?.uid ?? '') ? (
                    <span className="text-xs text-slate-400">Tu cuenta</span>
                  ) : (
                    <button
                      onClick={() => deshabilitarUsuario(u.uid)}
                      disabled={guardando.has(u.uid)}
                      className="px-3 py-1.5 rounded border border-red-300 text-red-600 text-xs font-medium disabled:opacity-50 hover:bg-red-50"
                    >
                      {u.estado === 'deshabilitado' ? 'Reactivar' : 'Deshabilitar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                  No hay usuarios registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Solo el superadministrador puede asignar o modificar roles. El primer
        superadmin se crea con el script de inicialización; después se gestiona
        desde esta pantalla. Los cambios de rol requieren que el usuario cierre
        sesión y vuelva a entrar para aplicarse en el token.
      </p>
    </AdminLayout>
  );
}
