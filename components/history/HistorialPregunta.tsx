/**
 * Historial de cambios de una pregunta.
 *
 * Se muestra debajo de la tarjeta de revisión en /panel/preguntas/[id].
 * Consume GET /api/historial?preguntaId=...
 */

import { useCallback, useEffect, useState } from 'react';
import { useAdminUser } from '@/hooks/useAdminUser';
import EventoHistorialCard from './EventoHistorialCard';
import type { EventoHistorial } from '@/lib/historial';

interface Props {
  preguntaId: string;
  /** Reporte que se está revisando; resalta sus eventos vinculados. */
  reporteId?: string | null;
  limite?: number;
}

interface RespuestaHistorial {
  success?: boolean;
  eventos?: EventoHistorial[];
  total?: number;
  error?: string;
}

export default function HistorialPregunta({ preguntaId, reporteId, limite = 50 }: Props) {
  const { idToken } = useAdminUser();
  const [eventos, setEventos] = useState<EventoHistorial[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  const cargar = useCallback(async () => {
    if (!idToken || !preguntaId) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        preguntaId,
        limit: String(limite),
      });
      const response = await fetch(`/api/historial?${params.toString()}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = (await response.json()) as RespuestaHistorial;
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? 'No se pudo cargar el historial');
      }
      setEventos(data.eventos ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el historial');
      setEventos([]);
      setTotal(0);
    } finally {
      setCargando(false);
    }
  }, [idToken, preguntaId, limite]);

  useEffect(() => {
    void cargar();
  }, [cargar, recarga]);

  return (
    <section id="historial" className="bg-white rounded-xl shadow-sm p-6 mt-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-gray-700">Historial de cambios</h3>
          <p className="mt-1 text-xs text-gray-500">
            Trazabilidad de ediciones, revisiones e importaciones
            {total > 0 ? ` · ${total} evento${total === 1 ? '' : 's'}` : ''}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRecarga((valor) => valor + 1)}
          disabled={cargando}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          Actualizar
        </button>
      </div>

      {cargando && <p className="text-sm text-gray-500">Cargando historial…</p>}

      {!cargando && error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!cargando && !error && eventos.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Aún no hay cambios registrados para esta pregunta. El historial empieza a
          registrarse desde la implementación de esta funcionalidad.
        </div>
      )}

      {!cargando && !error && eventos.length > 0 && (
        <div className="space-y-3">
          {eventos.map((evento) => (
            <EventoHistorialCard
              key={evento.id}
              evento={evento}
              destacarReporte={reporteId}
            />
          ))}
        </div>
      )}
    </section>
  );
}
