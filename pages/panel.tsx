/**
 * Página principal del panel administrativo.
 *
 * Requiere sesión con custom claim `rol: 'admin'`; sin ella redirige
 * al login. Muestra el estado real del banco (`/api/bank/manifest`) y
 * accesos directos a los módulos del panel.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAdminUser } from '@/hooks/useAdminUser';
import type { ResumenBanco } from '@/lib/bank';
import AdminLayout from '@/components/layout/AdminLayout';

const MODULOS = [
  {
    href: '/panel/preguntas',
    titulo: '📋 Gestión de Preguntas',
    descripcion: 'Banco v2, legacy en solo lectura, filtros y revisión',
    hover: 'hover:bg-blue-50',
    borde: 'border-blue-300',
    texto: 'group-hover:text-blue-600',
  },
  {
    href: '/panel/contextos',
    titulo: '🖼️ Contextos',
    descripcion: 'Textos e imágenes compartidas (contexts_v2, D-05)',
    hover: 'hover:bg-cyan-50',
    borde: 'border-cyan-300',
    texto: 'group-hover:text-cyan-600',
  },
  {
    href: '/panel/banco',
    titulo: '📦 Publicación del banco',
    descripcion: 'Verificaciones, manifiesto activo y activación',
    hover: 'hover:bg-emerald-50',
    borde: 'border-emerald-300',
    texto: 'group-hover:text-emerald-600',
  },
  {
    href: '/panel/importar-csv',
    titulo: '📤 Importar JSONL / CSV',
    descripcion: 'Cargar preguntas y contextos con validación',
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
  const { idToken } = useAdminUser();
  const [usuario, setUsuario] = useState<User | null>(null);
  const [resumen, setResumen] = useState<ResumenBanco | null>(null);
  const [versionActiva, setVersionActiva] = useState<string>('');

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

  useEffect(() => {
    if (!idToken) return;
    let cancelado = false;
    fetch('/api/bank/manifest', {
      headers: { Authorization: `Bearer ${idToken}` },
    })
      .then((r) => r.json())
      .then((data: { resumen?: ResumenBanco; versionActiva?: string }) => {
        if (cancelado) return;
        setResumen(data.resumen ?? null);
        setVersionActiva(data.versionActiva ?? '');
      })
      .catch(() => {
        // El dashboard sigue siendo usable sin las cifras.
      });
    return () => {
      cancelado = true;
    };
  }, [idToken]);

  const tarjetas = [
    {
      etiqueta: 'Total de preguntas',
      valor: resumen?.total ?? '—',
      color: 'text-blue-600',
      fondo: 'bg-blue-100',
      icono: '❓',
    },
    {
      etiqueta: 'Aprobadas',
      valor: resumen?.aprobadas ?? '—',
      color: 'text-green-600',
      fondo: 'bg-green-100',
      icono: '✓',
    },
    {
      etiqueta: 'Pendientes',
      valor: resumen?.pendiente ?? '—',
      color: 'text-yellow-600',
      fondo: 'bg-yellow-100',
      icono: '⟳',
    },
    {
      etiqueta: 'Deshabilitadas',
      valor: resumen?.deshabilitado ?? '—',
      color: 'text-red-600',
      fondo: 'bg-red-100',
      icono: '✗',
    },
  ];

  return (
    <AdminLayout
      title="Panel Admin RutaUdeA"
      subtitle={`Gestión del banco de preguntas${versionActiva ? ` · ${versionActiva}` : ''}`}
      user={usuario}
      maxWidth="5xl"
    >
      <h1 className="text-3xl font-bold text-gray-900 mb-6">
        Bienvenido al panel administrativo
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {tarjetas.map((t) => (
          <div
            key={t.etiqueta}
            className="bg-white rounded-xl p-6 hover:shadow-lg transition-shadow"
          >
            <div
              className={`h-10 w-10 rounded-md ${t.fondo} flex items-center justify-center mb-4`}
            >
              <span className={`${t.color} text-xl`}>{t.icono}</span>
            </div>
            <h3 className="font-medium text-gray-500">{t.etiqueta}</h3>
            <p className={`text-2xl font-bold ${t.color}`}>{t.valor}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {MODULOS.map((modulo) => (
          <a
            key={modulo.href}
            href={modulo.href}
            className={`group block rounded-lg border border-dashed ${modulo.borde} p-6 text-center cursor-pointer ${modulo.hover} transition-colors`}
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
    </AdminLayout>
  );
}
