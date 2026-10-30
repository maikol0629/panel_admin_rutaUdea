/**
 * Componente ReportsDashboard - Indicadores del banco de preguntas.
 *
 * Agrega las preguntas (vía GET /api/questions) por estado, área y
 * dificultad, y muestra el estado de sincronización con la app móvil.
 */

import { useEffect, useState } from 'react';
import { useAdminUser } from '@/hooks/useAdminUser';

interface PreguntaMinima {
  estado?: string;
  area?: string;
  dificultad?: string;
}

interface Totales {
  total: number;
  aprobado: number;
  pendiente: number;
  deshabilitado: number;
}

interface AreaStat {
  area: string;
  nombre: string;
  total: number;
  aprobado: number;
  pendiente: number;
}

interface DificultadStat {
  dificultad: string;
  label: string;
  count: number;
  percentage: number;
}

const TOTALES_VACIOS: Totales = {
  total: 0,
  aprobado: 0,
  pendiente: 0,
  deshabilitado: 0,
};

function nombreArea(area: string): string {
  if (area === 'razonamiento_logico') return 'Razonamiento Lógico';
  if (area === 'competencia_lectora') return 'Competencia Lectora';
  return area || 'Sin área';
}

export default function ReportsDashboard() {
  const { idToken } = useAdminUser();
  const [totales, setTotales] = useState<Totales>(TOTALES_VACIOS);
  const [areas, setAreas] = useState<AreaStat[]>([]);
  const [dificultades, setDificultades] = useState<DificultadStat[]>([
    { dificultad: 'baja', label: 'Fácil', count: 0, percentage: 0 },
    { dificultad: 'media', label: 'Media', count: 0, percentage: 0 },
    { dificultad: 'alta', label: 'Difícil', count: 0, percentage: 0 },
  ]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!idToken) return;
    let cancelado = false;

    async function cargar() {
      setCargando(true);
      setError(null);
      try {
        const response = await fetch(
          '/api/questions?orderBy=id&orderDir=asc&limit=100&page=1',
          { headers: { Authorization: `Bearer ${idToken}` } },
        );
        const data = (await response.json()) as {
          success?: boolean;
          preguntas?: PreguntaMinima[];
          error?: string;
        };
        if (!response.ok || !data.success || !data.preguntas) {
          throw new Error(data.error ?? 'Error al cargar reportes');
        }

        const lista = data.preguntas;
        const t: Totales = { ...TOTALES_VACIOS, total: lista.length };
        const porArea = new Map<string, AreaStat>();
        const porDificultad: Record<string, number> = {
          baja: 0,
          media: 0,
          alta: 0,
        };

        for (const p of lista) {
          if (p.estado === 'aprobado') t.aprobado++;
          else if (p.estado === 'pendiente') t.pendiente++;
          else if (p.estado === 'deshabilitado') t.deshabilitado++;

          const claveArea = p.area ?? '';
          const actual = porArea.get(claveArea) ?? {
            area: claveArea,
            nombre: nombreArea(claveArea),
            total: 0,
            aprobado: 0,
            pendiente: 0,
          };
          actual.total++;
          if (p.estado === 'aprobado') actual.aprobado++;
          if (p.estado === 'pendiente') actual.pendiente++;
          porArea.set(claveArea, actual);

          if (p.dificultad && p.dificultad in porDificultad) {
            porDificultad[p.dificultad] = (porDificultad[p.dificultad] ?? 0) + 1;
          }
        }

        if (!cancelado) {
          setTotales(t);
          setAreas(Array.from(porArea.values()));
          setDificultades([
            {
              dificultad: 'baja',
              label: 'Fácil',
              count: porDificultad['baja'] ?? 0,
              percentage:
                t.total > 0
                  ? Math.round(((porDificultad['baja'] ?? 0) / t.total) * 100)
                  : 0,
            },
            {
              dificultad: 'media',
              label: 'Media',
              count: porDificultad['media'] ?? 0,
              percentage:
                t.total > 0
                  ? Math.round(((porDificultad['media'] ?? 0) / t.total) * 100)
                  : 0,
            },
            {
              dificultad: 'alta',
              label: 'Difícil',
              count: porDificultad['alta'] ?? 0,
              percentage:
                t.total > 0
                  ? Math.round(((porDificultad['alta'] ?? 0) / t.total) * 100)
                  : 0,
            },
          ]);
        }
      } catch (err) {
        if (!cancelado) {
          setError(err instanceof Error ? err.message : 'Error al cargar reportes');
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    void cargar();
    return () => {
      cancelado = true;
    };
  }, [idToken]);

  const tarjetas = [
    {
      titulo: 'Total Preguntas',
      valor: totales.total,
      fondo: 'bg-blue-50',
      texto: 'text-blue-600',
    },
    {
      titulo: 'Aprobado',
      valor: totales.aprobado,
      fondo: 'bg-green-50',
      texto: 'text-green-600',
    },
    {
      titulo: 'Pendiente',
      valor: totales.pendiente,
      fondo: 'bg-yellow-50',
      texto: 'text-yellow-600',
    },
    {
      titulo: 'Deshabilitado',
      valor: totales.deshabilitado,
      fondo: 'bg-red-50',
      texto: 'text-red-600',
    },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
      {cargando && <p className="text-sm text-gray-500 mb-4">Cargando indicadores…</p>}
      {error && (
        <div className="p-3 mb-4 bg-red-50 rounded border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {tarjetas.map((t) => (
          <div key={t.titulo} className={`p-4 ${t.fondo} rounded-xl`}>
            <div className={`text-2xl font-bold ${t.texto}`}>{t.valor}</div>
            <div className={`text-sm ${t.texto}`}>{t.titulo}</div>
          </div>
        ))}
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-500 mb-4">Distribución por Área</h3>
        {areas.length === 0 && (
          <p className="text-sm text-gray-400">Sin datos por área.</p>
        )}
        <div className="space-y-2">
          {areas.map((stat) => {
            const pct =
              totales.total > 0 ? Math.round((stat.total / totales.total) * 100) : 0;
            return (
              <div
                key={stat.area || 'sin-area'}
                className="flex justify-between items-center gap-4 text-sm"
              >
                <span className="font-medium w-44">{stat.nombre}</span>
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 rounded-full h-2 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-32 text-right">
                  {stat.aprobado} apr. / {stat.pendiente} pend. ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium text-gray-500 mb-4">
          Distribución por Dificultad
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {dificultades.map((d) => (
            <div
              key={d.dificultad}
              className="bg-gray-100 rounded-xl p-2 text-center text-xs"
            >
              <strong>{d.label}</strong>{' '}
              <span className="text-xs text-gray-500">{d.count}</span>
              <div className="mt-1 bg-gray-200 rounded-full h-1">
                <div
                  className="bg-blue-500 rounded-full h-1 transition-all"
                  style={{ width: `${d.percentage}%` }}
                />
              </div>
              <span className="text-xs block">{d.percentage}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 p-4 bg-gray-50 rounded-xl">
        <h4 className="text-sm font-medium text-gray-500 mb-2">
          Sincronización con App Móvil
        </h4>
        <div className="flex items-start">
          <div className="w-3 h-3 bg-green-500 rounded-full mr-2 mt-1 flex-shrink-0 animate-pulse" />
          <div>
            <p className="text-sm text-gray-500">
              La app descarga solo preguntas con estado “aprobado” vía{' '}
              <code>updateBankFromFirestore()</code>.
            </p>
            <p className="text-xs text-gray-400">
              Preguntas aprobadas visibles en simulacros: {totales.aprobado}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
