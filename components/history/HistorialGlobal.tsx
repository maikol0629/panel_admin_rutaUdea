/**
 * Auditoría global del historial de preguntas.
 *
 * Permite filtrar por pregunta, acción, origen, campo, actor, reporte, texto
 * libre y rango de fechas. Consume GET /api/historial.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAdminUser } from '@/hooks/useAdminUser';
import {
  ACCIONES_HISTORIAL,
  CAMPOS_HISTORIAL,
  ETIQUETAS_ACCION,
  ETIQUETAS_CAMPO,
  ETIQUETAS_ORIGEN,
  ORIGENES_HISTORIAL,
  type EventoHistorial,
} from '@/lib/historial';
import EventoHistorialCard from './EventoHistorialCard';

interface FiltrosState {
  preguntaId: string;
  accion: string;
  origen: string;
  campo: string;
  actor: string;
  reporteId: string;
  q: string;
  desde: string;
  hasta: string;
  page: number;
  limit: number;
}

interface RespuestaHistorial {
  success?: boolean;
  eventos?: EventoHistorial[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  error?: string;
}

const FILTROS_INICIALES: FiltrosState = {
  preguntaId: '',
  accion: '',
  origen: '',
  campo: '',
  actor: '',
  reporteId: '',
  q: '',
  desde: '',
  hasta: '',
  page: 1,
  limit: 20,
};

const inputClase =
  'w-full rounded-md border-gray-300 shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500';

export default function HistorialGlobal() {
  const { idToken } = useAdminUser();
  const [eventos, setEventos] = useState<EventoHistorial[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState<FiltrosState>(FILTROS_INICIALES);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresco, setRefresco] = useState(0);

  const cargar = useCallback(
    async (f: FiltrosState) => {
      if (!idToken) return;
      setCargando(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (f.preguntaId.trim()) params.set('preguntaId', f.preguntaId.trim());
        if (f.accion) params.set('accion', f.accion);
        if (f.origen) params.set('origen', f.origen);
        if (f.campo) params.set('campo', f.campo);
        if (f.actor.trim()) params.set('actor', f.actor.trim());
        if (f.reporteId.trim()) params.set('reporteId', f.reporteId.trim());
        if (f.q.trim()) params.set('q', f.q.trim());
        if (f.desde) params.set('desde', `${f.desde}T00:00:00.000Z`);
        if (f.hasta) params.set('hasta', `${f.hasta}T23:59:59.999Z`);
        params.set('page', String(f.page));
        params.set('limit', String(f.limit));

        const response = await fetch(`/api/historial?${params.toString()}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = (await response.json()) as RespuestaHistorial;
        if (!response.ok || !data.success) {
          throw new Error(data.error ?? 'Error al cargar el historial');
        }
        setEventos(data.eventos ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
        setPagina(data.page ?? f.page);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar el historial');
        setEventos([]);
        setTotal(0);
        setTotalPages(1);
        setPagina(1);
      } finally {
        setCargando(false);
      }
    },
    [idToken],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void cargar(filtros);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [cargar, filtros, refresco]);

  const actualizar = (clave: keyof FiltrosState, valor: string) => {
    setFiltros((prev) => ({
      ...prev,
      [clave]: clave === 'page' ? Number(valor) || 1 : valor,
      page: clave === 'page' ? Number(valor) || 1 : 1,
    }));
  };

  const limpiar = () => setFiltros(FILTROS_INICIALES);

  const filtrosActivos = [
    filtros.preguntaId && `Pregunta: ${filtros.preguntaId}`,
    filtros.accion &&
      `Acción: ${ETIQUETAS_ACCION[filtros.accion as keyof typeof ETIQUETAS_ACCION] ?? filtros.accion}`,
    filtros.origen &&
      `Origen: ${ETIQUETAS_ORIGEN[filtros.origen as keyof typeof ETIQUETAS_ORIGEN] ?? filtros.origen}`,
    filtros.campo && `Campo: ${ETIQUETAS_CAMPO[filtros.campo] ?? filtros.campo}`,
    filtros.actor && `Actor: ${filtros.actor}`,
    filtros.reporteId && `Reporte: ${filtros.reporteId}`,
    filtros.q && `Búsqueda: ${filtros.q}`,
    filtros.desde && `Desde: ${filtros.desde}`,
    filtros.hasta && `Hasta: ${filtros.hasta}`,
  ].filter(Boolean) as string[];

  return (
    <div>
      <p className="mb-6 text-sm text-gray-600">
        Consulta quién cambió cada pregunta, qué campo modificó, cuándo y desde qué
        reporte. Las imágenes se registran como metadatos (tipo, tamaño y hash), nunca
        como contenido completo.
      </p>

      {error && (
        <div className="mb-6 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
              Pregunta
            </label>
            <input
              type="search"
              value={filtros.preguntaId}
              onChange={(e) => actualizar('preguntaId', e.target.value)}
              placeholder="T1-P01"
              className={inputClase}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
              Acción
            </label>
            <select
              value={filtros.accion}
              onChange={(e) => actualizar('accion', e.target.value)}
              className={inputClase}
            >
              <option value="">-- Todas --</option>
              {ACCIONES_HISTORIAL.map((accion) => (
                <option key={accion} value={accion}>
                  {ETIQUETAS_ACCION[accion]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
              Origen
            </label>
            <select
              value={filtros.origen}
              onChange={(e) => actualizar('origen', e.target.value)}
              className={inputClase}
            >
              <option value="">-- Todos --</option>
              {ORIGENES_HISTORIAL.map((origen) => (
                <option key={origen} value={origen}>
                  {ETIQUETAS_ORIGEN[origen]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
              Campo
            </label>
            <select
              value={filtros.campo}
              onChange={(e) => actualizar('campo', e.target.value)}
              className={inputClase}
            >
              <option value="">-- Todos --</option>
              {CAMPOS_HISTORIAL.map((campo) => (
                <option key={campo} value={campo}>
                  {ETIQUETAS_CAMPO[campo] ?? campo}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
              Actor
            </label>
            <input
              type="search"
              value={filtros.actor}
              onChange={(e) => actualizar('actor', e.target.value)}
              placeholder="uid o nombre"
              className={inputClase}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
              Reporte
            </label>
            <input
              type="search"
              value={filtros.reporteId}
              onChange={(e) => actualizar('reporteId', e.target.value)}
              placeholder="ID del reporte"
              className={inputClase}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
              Desde
            </label>
            <input
              type="date"
              value={filtros.desde}
              onChange={(e) => actualizar('desde', e.target.value)}
              className={inputClase}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
              Hasta
            </label>
            <input
              type="date"
              value={filtros.hasta}
              onChange={(e) => actualizar('hasta', e.target.value)}
              className={inputClase}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
              Búsqueda libre
            </label>
            <input
              type="search"
              value={filtros.q}
              onChange={(e) => actualizar('q', e.target.value)}
              placeholder="ID, resumen, actor o reporte…"
              className={inputClase}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={limpiar}
              className="px-3 py-2 text-xs text-gray-500 underline-offset-2 hover:text-blue-600 hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        </div>

        {filtrosActivos.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Activos
            </span>
            {filtrosActivos.map((etiqueta) => (
              <span
                key={etiqueta}
                className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
              >
                {etiqueta}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          {cargando ? 'Cargando eventos…' : `${total} evento${total === 1 ? '' : 's'}`}
        </span>
        <button
          type="button"
          onClick={() => setRefresco((valor) => valor + 1)}
          disabled={cargando}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          Actualizar
        </button>
      </div>

      {!cargando && !error && eventos.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-gray-500">
          <p>No hay eventos con los filtros aplicados.</p>
          {filtrosActivos.length > 0 && (
            <p className="mt-2 text-xs">Prueba ajustando los filtros.</p>
          )}
        </div>
      )}

      {!cargando && eventos.length > 0 && (
        <div className="space-y-3">
          {eventos.map((evento) => (
            <EventoHistorialCard key={evento.id} evento={evento} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() =>
              setFiltros((prev) => ({ ...prev, page: Math.max(1, pagina - 1) }))
            }
            disabled={pagina <= 1 || cargando}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-600">
            Página {pagina} de {totalPages} ({total} eventos)
          </span>
          <button
            type="button"
            onClick={() =>
              setFiltros((prev) => ({
                ...prev,
                page: Math.min(totalPages, pagina + 1),
              }))
            }
            disabled={pagina >= totalPages || cargando}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
