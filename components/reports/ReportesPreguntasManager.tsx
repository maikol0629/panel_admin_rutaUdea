/**
 * ReportesPreguntasManager — Gestión general de reportes de inconsistencia
 * de preguntas enviados por los aspirantes desde la app móvil.
 *
 * Muestra tarjetas de estado, una lista paginable con filtros y permite al
 * admin revisar / descartar / reabrir cada reporte, opcionalmente con notas
 * de administrador. Consume GET / PATCH /api/reportesPreguntas.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminUser } from '@/hooks/useAdminUser';

const ESTADOS: { clave: string; etiqueta: string; color: string }[] = [
  { clave: 'pendiente', etiqueta: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  { clave: 'revisado', etiqueta: 'Revisado', color: 'bg-green-100 text-green-800' },
  { clave: 'descartado', etiqueta: 'Descartado', color: 'bg-gray-100 text-gray-800' },
];

const MODOS: { clave: string; etiqueta: string }[] = [
  { clave: 'simulacro', etiqueta: 'Simulacro' },
  { clave: 'practica', etiqueta: 'Práctica' },
];

const MOTIVOS: { clave: string; etiqueta: string }[] = [
  { clave: 'enunciado_confuso', etiqueta: 'Enunciado confuso' },
  { clave: 'respuesta_incorrecta', etiqueta: 'Respuesta incorrecta' },
  { clave: 'explicacion_incorrecta', etiqueta: 'Explicación incorrecta' },
  { clave: 'faltan_datos', etiqueta: 'Faltan datos o imagen' },
  { clave: 'ortografia', etiqueta: 'Ortografía o redacción' },
  { clave: 'otra', etiqueta: 'Otra' },
];

interface ReportePregunta {
  id: string;
  uid: string;
  questionId: string;
  motivo: string;
  comentario: string;
  modo: 'simulacro' | 'practica';
  sesionId: string;
  area: string;
  subtema: string;
  bancoVersion?: string | null;
  respuestaUsuario?: string | null;
  respuestaCorrecta?: string | null;
  fechaMs: number;
  appVersionCode: number;
  estado: 'pendiente' | 'revisado' | 'descartado';
  revisadoPor?: string | null;
  fechaRevision?: string | null;
  notasAdmin?: string | null;
}

interface FiltrosState {
  estado: string;
  modo: string;
  motivo: string;
  q: string;
  page: number;
  limit: number;
}

interface ListadoResponse {
  success?: boolean;
  reportes?: ReportePregunta[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  error?: string;
}

const FILTROS_INICIALES: FiltrosState = {
  estado: '',
  modo: '',
  motivo: '',
  q: '',
  page: 1,
  limit: 20,
};

const inputClase =
  'w-full rounded-md border-gray-300 shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500';

function etiquetaEstado(clave: string): string {
  const e = ESTADOS.find((x) => x.clave === clave);
  return e ? e.etiqueta : clave;
}

function fechaLegible(fechaMs: number): string {
  try {
    return new Date(fechaMs).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(fechaMs);
  }
}

function recortar(texto: string, max = 90): string {
  return texto.length > max ? texto.slice(0, max) + '…' : texto;
}

export default function ReportesPreguntasManager() {
  const { idToken } = useAdminUser();

  const [reportes, setReportes] = useState<ReportePregunta[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filtros, setFiltros] = useState<FiltrosState>(FILTROS_INICIALES);
  const [esCargando, setEsCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edición inline de un reporte.
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [notasTemp, setNotasTemp] = useState('');

  // Conteo por estado para las tarjetas.
  const porEstado = reportes.reduce(
    (acc, r) => {
      acc[r.estado] = (acc[r.estado] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const cargarReportes = useCallback(
    async (f: FiltrosState) => {
      if (!idToken) return;
      setEsCargando(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (f.estado) params.set('estado', f.estado);
        if (f.modo) params.set('modo', f.modo);
        if (f.motivo) params.set('motivo', f.motivo);
        if (f.q.trim()) params.set('q', f.q.trim());
        params.set('page', String(f.page));
        params.set('limit', String(f.limit));

        const response = await fetch(`/api/reportesPreguntas?${params.toString()}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = (await response.json()) as ListadoResponse;
        if (!response.ok || !data.success) {
          throw new Error(data.error ?? 'Error al cargar reportes');
        }
        setReportes(data.reportes ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar reportes');
        setReportes([]);
      } finally {
        setEsCargando(false);
      }
    },
    [idToken],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void cargarReportes(filtros);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [cargarReportes, filtros]);

  const actualizarFiltro = (clave: keyof FiltrosState, valor: string) => {
    setFiltros((prev) => ({
      ...prev,
      [clave]: valor,
      page: clave === 'page' ? Number(valor) || 1 : 1,
    }));
  };

  const irPagina = (nueva: number) => {
    setFiltros((prev) => ({ ...prev, page: nueva }));
  };

  const quitarFiltro = (clave: keyof FiltrosState) => {
    setFiltros((prev) => ({
      ...prev,
      [clave]: '',
      page: 1,
    }));
  };

  const limpiarFiltros = () => setFiltros(FILTROS_INICIALES);

  const filtrosActivos = [
    filtros.estado && {
      clave: 'estado',
      etiqueta: `Estado: ${etiquetaEstado(filtros.estado)}`,
    },
    filtros.modo && {
      clave: 'modo',
      etiqueta: `Modo: ${filtros.modo === 'simulacro' ? 'Simulacro' : 'Práctica'}`,
    },
    filtros.motivo && {
      clave: 'motivo',
      etiqueta: `Motivo: ${MOTIVOS.find((m) => m.clave === filtros.motivo)?.etiqueta ?? filtros.motivo}`,
    },
    filtros.q && { clave: 'q', etiqueta: `Búsqueda: ${filtros.q}` },
  ].filter(Boolean) as { clave: keyof FiltrosState; etiqueta: string }[];

  /**
   * Cambia el estado de un reporte. Si se está editando inline, también
   * envía las notas temporales.
   */
  const cambiarEstado = async (
    reporte: ReportePregunta,
    nuevoEstado: 'pendiente' | 'revisado' | 'descartado',
    notas?: string,
  ) => {
    if (!idToken) return;
    setEsCargando(true);
    setError(null);
    try {
      const response = await fetch('/api/reportesPreguntas', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reporteId: reporte.id,
          estado: nuevoEstado,
          notasAdmin: notas !== undefined ? notas : (reporte.notasAdmin ?? null),
        }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        mensaje?: string;
        error?: string;
      };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? 'Error al actualizar el reporte');
      }

      // Refrescar la lista y cerrar edición.
      setReportes((prev) =>
        prev.map((r) => (r.id === reporte.id ? { ...r, estado: nuevoEstado } : r)),
      );
      setEditandoId(null);
      setNotasTemp('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el reporte');
    } finally {
      setEsCargando(false);
    }
  };

  const abrirEdicion = (reporte: ReportePregunta) => {
    setEditandoId(reporte.id);
    setNotasTemp(reporte.notasAdmin ?? '');
  };

  const cerrarEdicion = () => {
    setEditandoId(null);
    setNotasTemp('');
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-slate-900 mb-2">
        Gestión de Reportes de Preguntas
      </h1>
      <p className="text-sm text-gray-600 mb-8">
        Los aspirantes reportan inconsistencias (enunciado, respuesta, explicación, datos
        o imagen) desde el simulacro y la práctica. Aquí puedes revisar, descartar o
        reabrir cada reporte.
      </p>

      {error && (
        <div className="mb-6 p-3 bg-red-50 rounded border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Tarjetas de estado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          {
            etiqueta: 'Total',
            valor: total,
            color: 'text-blue-600',
            fondo: 'bg-blue-50',
          },
          {
            etiqueta: 'Pendientes',
            valor: porEstado['pendiente'] ?? 0,
            color: 'text-yellow-600',
            fondo: 'bg-yellow-50',
          },
          {
            etiqueta: 'Revisados',
            valor: porEstado['revisado'] ?? 0,
            color: 'text-green-600',
            fondo: 'bg-green-50',
          },
          {
            etiqueta: 'Descartados',
            valor: porEstado['descartado'] ?? 0,
            color: 'text-gray-600',
            fondo: 'bg-gray-50',
          },
        ].map((t) => (
          <div key={t.etiqueta} className={`p-4 rounded-xl ${t.fondo}`}>
            <div className={`text-2xl font-bold ${t.color}`}>{t.valor}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">
              {t.etiqueta}
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">
              Estado
            </label>
            <select
              name="estado"
              value={filtros.estado}
              onChange={(e) => actualizarFiltro('estado', e.target.value)}
              className={inputClase}
            >
              <option value="">-- Todos --</option>
              {ESTADOS.map((e) => (
                <option key={e.clave} value={e.clave}>
                  {e.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">
              Modo
            </label>
            <select
              name="modo"
              value={filtros.modo}
              onChange={(e) => actualizarFiltro('modo', e.target.value)}
              className={inputClase}
            >
              <option value="">-- Todos --</option>
              {MODOS.map((m) => (
                <option key={m.clave} value={m.clave}>
                  {m.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">
              Motivo
            </label>
            <select
              name="motivo"
              value={filtros.motivo}
              onChange={(e) => actualizarFiltro('motivo', e.target.value)}
              className={inputClase}
            >
              <option value="">-- Todos --</option>
              {MOTIVOS.map((m) => (
                <option key={m.clave} value={m.clave}>
                  {m.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col justify-end">
            <label className="sr-only">Búsqueda</label>
            <input
              name="q"
              type="search"
              value={filtros.q}
              onChange={(e) => actualizarFiltro('q', e.target.value)}
              placeholder="ID pregunta, comentario, usuario…"
              className={inputClase}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={limpiarFiltros}
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
            {filtrosActivos.map((f) => (
              <button
                key={f.clave}
                type="button"
                onClick={() => quitarFiltro(f.clave)}
                className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                aria-label={`Quitar ${f.etiqueta}`}
              >
                {f.etiqueta} ×
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabla de reportes */}
      <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-slate-200">
        {esCargando && (
          <div className="p-8 text-center text-sm text-gray-500">Cargando reportes…</div>
        )}
        {!esCargando && reportes.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <p>No hay reportes con los filtros aplicados.</p>
            {filtrosActivos.length > 0 && (
              <p className="mt-2 text-xs">Prueba ajustando los filtros.</p>
            )}
          </div>
        )}
        {!esCargando && reportes.length > 0 && (
          <>
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 uppercase w-20">
                    Fecha
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 w-24">
                    Usuario
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600">
                    Pregunta
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 w-32">
                    Motivo
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 w-48">
                    Comentario
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 w-16">
                    Modo
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-gray-600 w-20">
                    Estado
                  </th>
                  <th className="p-3 text-right text-xs font-semibold text-gray-600 w-24">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reportes.map((reporte) => {
                  const estaEditando = editandoId === reporte.id;
                  const estadoConf = ESTADOS.find((e) => e.clave === reporte.estado);
                  const motivoConf = MOTIVOS.find((m) => m.clave === reporte.motivo);
                  const modoConf = MODOS.find((m) => m.clave === reporte.modo);

                  return (
                    <tr
                      key={reporte.id}
                      className="bg-white hover:bg-gray-50 transition-colors"
                    >
                      <td className="p-3 text-xs text-gray-500 font-mono">
                        {fechaLegible(reporte.fechaMs)}
                      </td>
                      <td
                        className="p-3 text-xs text-gray-700 truncate max-w-xs"
                        title={reporte.uid}
                      >
                        {reporte.uid.length > 18
                          ? reporte.uid.slice(0, 15) + '…'
                          : reporte.uid}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <div
                            className="text-xs font-medium text-gray-700 truncate"
                            title={`ID: ${reporte.questionId}`}
                          >
                            {reporte.questionId}
                          </div>
                          <div className="text-[10px] text-gray-400 truncate">
                            {reporte.area} / {reporte.subtema}
                          </div>
                          <div className="mt-1 flex gap-2">
                            <Link
                              href={`/panel/preguntas/${encodeURIComponent(reporte.questionId)}`}
                              className="text-xs text-blue-600 hover:underline"
                              title="Ver pregunta"
                            >
                              Ver pregunta
                            </Link>
                            <Link
                              href={`/panel/preguntas/${encodeURIComponent(reporte.questionId)}/editar`}
                              className="text-xs text-yellow-700 hover:underline"
                              title="Editar pregunta"
                            >
                              Editar
                            </Link>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-xs text-gray-600">
                        {motivoConf?.etiqueta ?? reporte.motivo}
                      </td>
                      <td
                        className="p-3 text-xs text-gray-700 truncate max-w-md"
                        title={reporte.comentario}
                      >
                        {recortar(reporte.comentario)}
                      </td>
                      <td className="p-3 text-xs text-gray-500">
                        {modoConf?.etiqueta ?? reporte.modo}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${estadoConf?.color ?? 'bg-gray-100 text-gray-800'}`}
                        >
                          {etiquetaEstado(reporte.estado)}
                        </span>
                        {reporte.fechaRevision && (
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            revisado{' '}
                            {fechaLegible(new Date(reporte.fechaRevision).getTime())}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {estaEditando ? (
                          <div className="flex items-center gap-2">
                            <textarea
                              value={notasTemp}
                              onChange={(e) => setNotasTemp(e.target.value)}
                              placeholder="Notas del admin…"
                              rows={2}
                              className="w-40 text-xs border border-gray-300 rounded p-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const nuevo =
                                  reporte.estado === 'pendiente'
                                    ? 'revisado'
                                    : 'pendiente';
                                void cambiarEstado(reporte, nuevo, notasTemp);
                              }}
                              disabled={esCargando}
                              className="px-2 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={cerrarEdicion}
                              className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : reporte.estado === 'pendiente' ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void cambiarEstado(reporte, 'revisado')}
                              disabled={esCargando}
                              className="px-2 py-1 text-xs text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                              title="Marcar como revisado"
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              onClick={() => void cambiarEstado(reporte, 'descartado')}
                              disabled={esCargando}
                              className="px-2 py-1 text-xs text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                              title="Descartar reporte"
                            >
                              ✗
                            </button>
                            <button
                              type="button"
                              onClick={() => abrirEdicion(reporte)}
                              disabled={esCargando}
                              className="px-2 py-1 text-xs text-gray-600 bg-gray-50 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
                              title="Agregar notas y revisar"
                            >
                              Notas
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => abrirEdicion(reporte)}
                            disabled={esCargando}
                            className="px-2 py-1 text-xs text-gray-600 bg-gray-50 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
                            title="Reabrir / editar notas"
                          >
                            Editar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="mt-6 flex justify-center items-center gap-2">
                <button
                  type="button"
                  onClick={() => irPagina(filtros.page - 1)}
                  disabled={filtros.page <= 1 || esCargando}
                  className="px-4 py-2 rounded-md font-medium text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-600">
                  Página {filtros.page} de {totalPages} ({total} reportes)
                </span>
                <button
                  type="button"
                  onClick={() => irPagina(filtros.page + 1)}
                  disabled={filtros.page >= totalPages || esCargando}
                  className="px-4 py-2 rounded-md font-medium text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
        <p className="text-sm text-blue-800">
          <strong>Cómo funciona:</strong> cada reporte llega con estado
          <code className="font-mono text-xs">pendiente</code>. Al marcarlo como{' '}
          <code className="font-mono text-xs">revisado</code> o{' '}
          <code className="font-mono text-xs">descartado</code> se registra
          automáticamente el admin que lo revisó y la fecha. Las notas del admin se
          guardan en el reporte para dar seguimiento al banco de preguntas.
        </p>
      </div>
    </div>
  );
}
