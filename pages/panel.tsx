/**
 * Página principal del panel administrativo.
 *
 * Requiere sesión con custom claim `rol: 'admin'`; sin ella redirige
 * al login. Muestra accesos directos a los módulos del panel.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const MODULOS = [
  {
    href: '/panel/preguntas',
    titulo: '📋 Gestión de Preguntas',
    descripcion: 'CRUD completo, filtros, búsqueda',
    hover: 'hover:bg-blue-50',
    borde: 'border-blue-300',
    texto: 'group-hover:text-blue-600',
  },
  {
    href: '/panel/importar-csv',
    titulo: '📤 Importar CSV',
    descripcion: 'Cargar preguntas masivas con validación',
    hover: 'hover:bg-green-50',
    borde: 'border-green-300',
    texto: 'group-hover:text-green-600',
  },
  {
    href: '/panel/configurar',
    titulo: '⚙️ Configuración',
    descripcion: 'Parámetros del simulacro, tiempo, inactividad',
    hover: 'hover:bg-purple-50',
    borde: 'border-purple-300',
    texto: 'group-hover:text-purple-600',
  },
  {
    href: '/panel/reportes',
    titulo: '📊 Reportes',
    descripcion: 'Indicadores, distribución, estadísticas',
    hover: 'hover:bg-orange-50',
    borde: 'border-orange-300',
    texto: 'group-hover:text-orange-600',
  },
];

export default function PanelDashboard() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<User | null>(null);

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
          if (claims['rol'] !== 'admin') {
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

  const cerrarSesion = () => {
    signOut(auth).finally(() => {
      void router.replace('/auth/login');
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold uppercase text-xs">ADM</span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Panel Admin RutaUdeA
              </h2>
              <p className="text-sm text-gray-500">Gestión del banco de preguntas</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {usuario?.displayName ?? usuario?.email ?? 'Admin'}
            </span>

            <button
              onClick={cerrarSesion}
              className="text-sm text-red-600 hover:underline"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </nav>

      <main className="p-6 sm:p-8 max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Bienvenido al panel administrativo
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-6 hover:shadow-lg transition-shadow">
            <div className="h-10 w-10 rounded-md bg-blue-100 flex items-center justify-center mb-4">
              <span className="text-blue-600 text-xl">❓</span>
            </div>
            <h3 className="font-medium text-gray-500">Total de preguntas</h3>
            <p className="text-2xl font-bold text-blue-600">0</p>
          </div>

          <div className="bg-white rounded-xl p-6 hover:shadow-lg transition-shadow">
            <div className="h-10 w-10 rounded-md bg-green-100 flex items-center justify-center mb-4">
              <span className="text-green-600 text-xl">✓</span>
            </div>
            <h3 className="font-medium text-gray-500">Aprobadas</h3>
            <p className="text-2xl font-bold text-green-600">0</p>
          </div>

          <div className="bg-white rounded-xl p-6 hover:shadow-lg transition-shadow">
            <div className="h-10 w-10 rounded-md bg-yellow-100 flex items-center justify-center mb-4">
              <span className="text-yellow-600 text-xl">⟳</span>
            </div>
            <h3 className="font-medium text-gray-500">Pendientes</h3>
            <p className="text-2xl font-bold text-yellow-600">0</p>
          </div>

          <div className="bg-white rounded-xl p-6 hover:shadow-lg transition-shadow">
            <div className="h-10 w-10 rounded-md bg-red-100 flex items-center justify-center mb-4">
              <span className="text-red-600 text-xl">✗</span>
            </div>
            <h3 className="font-medium text-gray-500">Deshabilitadas</h3>
            <p className="text-2xl font-bold text-red-600">0</p>
          </div>
        </div>

        <div className="space-y-4">
          {MODULOS.map((modulo) => (
            <a
              key={modulo.href}
              href={modulo.href}
              className={`group block rounded-lg border border-dashed ${modulo.borde} p-8 text-center cursor-pointer ${modulo.hover} transition-colors`}
            >
              <h3
                className={`text-lg font-medium text-gray-500 ${modulo.texto} transition-colors`}
              >
                {modulo.titulo}
              </h3>
              <p className="mt-2 text-sm text-gray-400">{modulo.descripcion}</p>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
