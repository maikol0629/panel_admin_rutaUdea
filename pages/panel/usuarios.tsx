/**
 * Página de gestión de usuarios y roles (solo superadmin).
 *
 * Permite listar usuarios del panel, asignar rol (admin / superadmin),
 * deshabilitar o reactivar cuentas. Es el punto de entrada para el
 * módulo de superadmin (Fase 9, punto 4).
 *
 * Diseño alineado con el resto del panel (contextos, configurar, preguntas).
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

const inputClase =
  'w-full rounded-md border-gray-300 shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500';

export default function UsuariosPage() {
  const router = useRouter();
  const { idToken } = useAdminUser();
  const [usuario, setUsuario] = useState<User | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
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
    setError(null);
    try {
      const r = await fetch('/api/usuarios', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error al cargar usuarios');
      setUsuarios(data.usuarios ?? []);
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
    setError(null);
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
      setExito(`Usuario actualizado correctamente.`);
      setUsuarios((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, [campo]: valor } : u)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar usuario');
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
    setError(null);
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
      setExito(`Usuario ${data.mensaje ?? 'deshabilitado'}.`);
      setUsuarios((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, estado: 'deshabilitado' } : u)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al deshabilitar usuario');
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
      backHref="/panel"
      maxWidth="7xl"
    >
      <h1 className="text-3xl font-bold text-slate-900 mb-6">Usuarios y roles</h1>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-md mb-6">
          {error}
        </div>
      )}

      {exito && (
        <div className="bg-green-50 border-l-4 border-green-500 text-green-700 p-4 rounded-md mb-6">
          {exito}
        </div>
      )}

      <div className="mb-6 flex items-center gap-2">
        <button
          onClick={cargarUsuarios}
          disabled={cargando}
          className="flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
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
                  <span className="text-slate-900 font-medium">{u.correo}</span>
                </td>
                <td className="px-6 py-3">
                  <span className="text-slate-600">{u.nombre ?? '—'}</span>
                </td>
                <td className="px-6 py-3">
                  <select
                    value={u.rol}
                    disabled={guardando.has(u.uid)}
                    onChange={(e) => actualizarUsuario(u.uid, 'rol', e.target.value)}
                    className={inputClase}
                  >
                    {rolOptions.map((r) => (
                      <option key={r} value={r}>
                        {r === 'superadmin'
                          ? 'Superadmin'
                          : r === 'admin'
                            ? 'Admin'
                            : 'Aspirante'}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-6 py-3">
                  <select
                    value={u.estado}
                    disabled={guardando.has(u.uid)}
                    onChange={(e) => actualizarUsuario(u.uid, 'estado', e.target.value)}
                    className={inputClase}
                  >
                    {estadoOptions.map((e) => (
                      <option key={e} value={e}>
                        {e === 'activo' ? 'Activo' : 'Deshabilitado'}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-6 py-3 text-slate-600 font-mono text-xs">
                  {u.proveedor ?? '—'}
                </td>
                <td className="px-6 py-3">
                  {u.uid === (usuario?.uid ?? '') ? (
                    <span className="text-xs text-slate-400">Tu cuenta</span>
                  ) : (
                    <button
                      onClick={() => deshabilitarUsuario(u.uid)}
                      disabled={guardando.has(u.uid)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded border border-red-200 text-red-600 text-xs font-medium disabled:opacity-50 hover:bg-red-50 transition-colors"
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

      <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Acciones rápidas</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={cargarUsuarios}
            disabled={cargando}
            className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {cargando ? 'Cargando…' : 'Refrescar lista'}
          </button>
          <a
            href="/panel"
            className="px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Volver al panel
          </a>
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Solo el superadministrador puede asignar o modificar roles. El primer superadmin
        se crea con el script de inicialización; después se gestiona desde esta pantalla.
        Los cambios de rol requieren que el usuario cierre sesión y vuelva a entrar para
        aplicarse en el token.
      </p>
    </AdminLayout>
  );
}
