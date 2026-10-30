/**
 * Componente QuestionsList — Lista del banco con filtros v2.
 *
 * Consume GET /api/questions. Filtros: banco (v2/legacy), versión,
 * área, subtema, dificultad, estado, confianza, tarea, imágenes,
 * opciones en imagen, búsqueda, ID, incompletas, orden y paginación.
 *
 * El banco legacy (`questions`) se muestra en solo lectura para rollback.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import Link from 'next/link';
import { useAdminUser } from '@/hooks/useAdminUser';
import type { ResumenBanco } from '@/lib/bank';

interface FilaTabla {
  id: string;
  area: string;
  componente: string;
  subtema: string;
  dificultad: string;
  pregunta: string;
  respuesta_correcta: string | null;
  estado: string;
  bank_version: string;
  tarea?: string | null;
  confianza_modelo?: string | null;
  imagenes: unknown[];
  opciones_en_imagen: boolean;
}

interface FiltrosState {
  banco: 'v2' | 'legacy';
  area: string;
  subtema: string;
  dificultad: string;
  estado: string;
  confianza: string;
  tarea: string;
  search: string;
  conImagen: boolean;
  opcionesEnImagen: boolean;
  soloIncompletas: boolean;
  orderBy: string;
  orderDir: 'asc' | 'desc';
  page: number;
  limit: number;
}

interface ListadoResponse {
  success?: boolean;
  banco?: 'v2' | 'legacy';
  soloLectura?: boolean;
  preguntas?: FilaTabla[];
  total?: number;
  totalIncompletas?: number;
  resumen?: ResumenBanco;
  page?: number;
  totalPages?: number;
  hasMore?: boolean;
  error?: string;
}

const FILTROS_INICIALES: FiltrosState = {
  banco: 'v2',
  area: '',
  subtema: '',
  dificultad: '',
  estado: '',
  confianza: '',
  tarea: '',
  search: '',
  conImagen: false,
  opcionesEnImagen: false,
  soloIncompletas: false,
  orderBy: 'id',
  orderDir: 'asc',
  page: 1,
  limit: 20,
};

function claseDificultad(dificultad: string): string {
  switch (dificultad) {
    case 'baja':
      return 'bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs';
    case 'media':
      return 'bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs';
    case 'alta':
      return 'bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs';
    default:
      return 'bg-gray-100 text-gray-800 px-2 py-0.5 rounded text-xs';
  }
}

function claseEstado(estado: string): string {
  switch (estado) {
    case 'aprobado':
      return 'bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs';
    case 'aprobado_con_imagen':
      return 'bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-xs';
    case 'pendiente':
      return 'bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs';
    case 'deshabilitado':
      return 'bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs';
    default:
      return 'bg-gray-100 text-gray-800 px-2 py-0.5 rounded text-xs';
  }
}

const inputClase =
  'w-full rounded-md border-gray-300 shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500';

export default function QuestionsList() {
  const { idToken } = useAdminUser();
  const [mostrarAvanzados, setMostrarAvanzados] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosState>(FILTROS_INICIALES);
  const [preguntas, setPreguntas] = useState<FilaTabla[]>([]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalIncompletas, setTotalIncompletas] = useState(0);
  const [resumen, setResumen] = useState<ResumenBanco | null>(null);
  const [soloLectura, setSoloLectura] = useState(false);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [esCargando, setEsCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarPreguntas = useCallback(
    async (f: FiltrosState) => {
      if (!idToken) return;
      setEsCargando(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (f.banco === 'legacy') params.set('banco', 'legacy');
        if (f.area) params.set('area', f.area);
        if (f.subtema) params.set('subtema', f.subtema);
        if (f.dificultad) params.set('dificultad', f.dificultad);
        if (f.estado) params.set('estado', f.estado);
        if (f.confianza) params.set('confianza', f.confianza);
        if (f.tarea) params.set('tarea', f.tarea);
        if (f.search.trim()) params.set('search', f.search.trim());
        if (f.conImagen) params.set('con_imagen', 'true');
        if (f.opcionesEnImagen) params.set('opciones_en_imagen', 'true');
        if (f.soloIncompletas) params.set('incompletas', 'true');
        params.set('orderBy', f.orderBy);
        params.set('orderDir', f.orderDir);
        params.set('limit', String(f.limit));
        params.set('page', String(f.page));

        const response = await fetch(`/api/questions?${params.toString()}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        const contentType = response.headers.get('content-type') ?? '';
        if (!response.ok || !contentType.includes('application/json')) {
          const texto = await response.text().catch(() => '');
          const preview = texto.slice(0, 200).replace(/\n/g, ' ');
          throw new Error(
            `Error ${response.status} al cargar preguntas${
              preview ? ': ' + preview : ''
            }`,
          );
        }

        const data = (await response.json()) as ListadoResponse;
        if (!data.success || !data.preguntas) {
          throw new Error(data.error ?? 'Error al cargar preguntas');
        }
        setPreguntas(data.preguntas);
        setTotalRegistros(data.total ?? 0);
        setTotalIncompletas(data.totalIncompletas ?? 0);
        setResumen(data.resumen ?? null);
        setSoloLectura(data.soloLectura === true);
        setTotalPaginas(data.totalPages ?? 1);
        setHasMore(data.hasMore ?? false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar preguntas');
        setPreguntas([]);
      } finally {
        setEsCargando(false);
      }
    },
    [idToken],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void cargarPreguntas(filtros);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [cargarPreguntas, filtros]);

  const actualizarFiltro = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFiltros((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
      page: name === 'limit' || name === 'page' ? Number(value) || 1 : 1,
    }));
  };

  const irPagina = (nueva: number) => {
    setFiltros((prev) => ({ ...prev, page: nueva }));
  };

  const cambiarBanco = (banco: 'v2' | 'legacy') => {
    setFiltros((prev) => ({ ...prev, banco, page: 1 }));
  };

  const filtrosActivos = [
    filtros.search && { clave: 'search', etiqueta: `Búsqueda: ${filtros.search}` },
    filtros.area && {
      clave: 'area',
      etiqueta: `Área: ${
        filtros.area === 'razonamiento_logico'
          ? 'Razonamiento lógico'
          : 'Competencia lectora'
      }`,
    },
    filtros.subtema && { clave: 'subtema', etiqueta: `Subtema: ${filtros.subtema}` },
    filtros.dificultad && {
      clave: 'dificultad',
      etiqueta: `Dificultad: ${filtros.dificultad}`,
    },
    filtros.estado && {
      clave: 'estado',
      etiqueta: `Estado: ${filtros.estado.replaceAll('_', ' ')}`,
    },
    filtros.confianza && {
      clave: 'confianza',
      etiqueta: `Confianza: ${filtros.confianza.replaceAll('_', ' ')}`,
    },
    filtros.tarea && { clave: 'tarea', etiqueta: `Tarea: ${filtros.tarea}` },
    filtros.conImagen && { clave: 'conImagen', etiqueta: 'Con imagen' },
    filtros.opcionesEnImagen && {
      clave: 'opcionesEnImagen',
      etiqueta: 'Opciones en imagen',
    },
    filtros.soloIncompletas && {
      clave: 'soloIncompletas',
      etiqueta: 'Solo incompletas',
    },
  ].filter(Boolean) as { clave: keyof FiltrosState; etiqueta: string }[];
  const filtrosAvanzadosActivos = filtrosActivos.filter((filtro) =>
    ['confianza', 'tarea', 'conImagen', 'opcionesEnImagen', 'soloIncompletas'].includes(
      filtro.clave,
    ),
  );

  const limpiarFiltros = () => {
    setFiltros((prev) => ({ ...FILTROS_INICIALES, banco: prev.banco }));
  };

  const quitarFiltro = (clave: keyof FiltrosState) => {
    setFiltros((prev) => ({
      ...prev,
      [clave]: typeof prev[clave] === 'boolean' ? false : '',
      page: 1,
    }));
  };

  return (
    <>
      <div>
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                Explorar banco
              </p>
              <h3 className="mt-1 text-xl font-semibold text-slate-900">
                Encuentra una pregunta
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Busca por contenido o identificador y combina filtros cuando lo necesites.
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => cambiarBanco('v2')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  filtros.banco === 'v2'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Banco v2
              </button>
              <button
                type="button"
                onClick={() => cambiarBanco('legacy')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  filtros.banco === 'legacy'
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Legacy (solo lectura)
              </button>
            </div>
          </div>

          {soloLectura && (
            <div className="mb-4 p-3 bg-amber-50 rounded border border-amber-200 text-amber-800 text-sm">
              Está viendo el banco legacy `questions` (congelado). Solo lectura: las
              operaciones se hacen sobre `questions_v2`.
            </div>
          )}

          {resumen && (
            <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
              {[
                ['Total', resumen.total],
                ['Aprobadas', resumen.aprobadas],
                ['Con imagen', resumen.aprobado_con_imagen],
                ['Pendientes', resumen.pendiente],
                ['Deshabilitadas', resumen.deshabilitado],
                ['RL', resumen.razonamiento_logico],
                ['CL', resumen.competencia_lectora],
              ].map(([etiqueta, valor]) => (
                <div key={String(etiqueta)} className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">{etiqueta}</p>
                  <p className="text-lg font-semibold text-gray-800">{valor}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mb-5 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <label htmlFor="question-search" className="sr-only">
                Buscar por contenido o identificador
              </label>
              <input
                id="question-search"
                type="search"
                name="search"
                value={filtros.search}
                onChange={actualizarFiltro}
                placeholder="Buscar por contenido o ID, por ejemplo: proporcionalidad o T2-P01"
                className={`${inputClase} h-11 border-slate-300 pr-20 text-base`}
              />
              {filtros.search && (
                <button
                  type="button"
                  onClick={() => quitarFiltro('search')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 hover:text-blue-600"
                >
                  Limpiar
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMostrarAvanzados((prev) => !prev)}
              aria-expanded={mostrarAvanzados}
              className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              {mostrarAvanzados ? 'Ocultar avanzados' : 'Filtros avanzados'}
              {filtrosAvanzadosActivos.length > 0 && (
                <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                  {filtrosAvanzadosActivos.length}
                </span>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Área</label>
              <select
                name="area"
                value={filtros.area}
                onChange={actualizarFiltro}
                className={inputClase}
              >
                <option value="">-- Todas --</option>
                <option value="razonamiento_logico">Razonamiento Lógico (RL)</option>
                <option value="competencia_lectora">Competencia Lectora (CL)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Subtema
              </label>
              <input
                name="subtema"
                value={filtros.subtema}
                onChange={actualizarFiltro}
                className={inputClase}
                placeholder="Ej: RL02 Porcentajes"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dificultad
              </label>
              <select
                name="dificultad"
                value={filtros.dificultad}
                onChange={actualizarFiltro}
                className={inputClase}
              >
                <option value="">-- Todas --</option>
                <option value="baja">Fácil</option>
                <option value="media">Media</option>
                <option value="alta">Difícil</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estado
              </label>
              <select
                name="estado"
                value={filtros.estado}
                onChange={actualizarFiltro}
                className={inputClase}
              >
                <option value="">-- Todos --</option>
                <option value="aprobado">Aprobado</option>
                <option value="aprobado_con_imagen">Aprobado con imagen</option>
                <option value="pendiente">Pendiente</option>
                <option value="deshabilitado">Deshabilitado</option>
              </select>
            </div>
          </div>

          {mostrarAvanzados && (
            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confianza del modelo
                </label>
                <select
                  name="confianza"
                  value={filtros.confianza}
                  onChange={actualizarFiltro}
                  className={inputClase}
                >
                  <option value="">Todas las confianzas</option>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                  <option value="sin_definir">Sin definir</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tarea
                </label>
                <input
                  name="tarea"
                  value={filtros.tarea}
                  onChange={actualizarFiltro}
                  className={inputClase}
                  placeholder="Ej. T2"
                />
              </div>
              <div className="flex flex-col justify-end gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name="conImagen"
                    checked={filtros.conImagen}
                    onChange={actualizarFiltro}
                    className="h-4 w-4"
                  />
                  Solo con imagen
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name="opcionesEnImagen"
                    checked={filtros.opcionesEnImagen}
                    onChange={actualizarFiltro}
                    className="h-4 w-4"
                  />
                  Opciones en imagen (D-06)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name="soloIncompletas"
                    checked={filtros.soloIncompletas}
                    onChange={actualizarFiltro}
                    className="h-4 w-4"
                  />
                  Solo incompletas (sin enunciado, opciones o respuesta)
                  {totalIncompletas > 0 && (
                    <span className="ml-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded">
                      {totalIncompletas} por corregir
                    </span>
                  )}
                </label>
              </div>
            </div>
          )}

          {filtrosActivos.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Filtros activos
              </span>
              {filtrosActivos.map((filtro) => (
                <button
                  key={filtro.clave}
                  type="button"
                  onClick={() => quitarFiltro(filtro.clave)}
                  className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                  aria-label={`Quitar ${filtro.etiqueta}`}
                >
                  {filtro.etiqueta} ×
                </button>
              ))}
              <button
                type="button"
                onClick={limpiarFiltros}
                className="ml-auto text-xs font-medium text-slate-500 underline-offset-2 hover:text-blue-700 hover:underline"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-sm text-slate-500">
            {esCargando
              ? 'Actualizando resultados…'
              : `${totalRegistros} preguntas encontradas`}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span>Ordenar por</span>
              <select
                name="orderBy"
                value={filtros.orderBy}
                onChange={actualizarFiltro}
                className="rounded-lg border-slate-300 py-1.5 pl-2 pr-8 text-sm"
              >
                <option value="id">ID</option>
                <option value="componente">Componente</option>
                <option value="subtema">Subtema</option>
                <option value="dificultad">Dificultad</option>
                <option value="estado">Estado</option>
                <option value="pregunta">Enunciado (A-Z)</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span>Por página</span>
              <select
                name="limit"
                value={filtros.limit}
                onChange={actualizarFiltro}
                className="rounded-lg border-slate-300 py-1.5 pl-2 pr-8 text-sm"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </label>
          </div>
        </div>

        {esCargando && (
          <div className="my-8 p-4 bg-blue-50 rounded border border-blue-200 text-center text-sm">
            Cargando preguntas…
          </div>
        )}

        {error && (
          <div className="my-8 p-4 bg-red-50 rounded border border-red-200 text-center text-sm text-red-700">
            {error}
          </div>
        )}

        {!esCargando && !error && totalRegistros === 0 && (
          <div className="my-8 text-center text-gray-500">
            <p>No hay preguntas con los filtros aplicados.</p>
            <p className="mt-2">Prueba ajustando los filtros arriba.</p>
          </div>
        )}

        {totalRegistros > 0 && (
          <div className="overflow-x-auto bg-white rounded-xl shadow-sm">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase">
                  <th className="p-2">ID</th>
                  <th className="p-2">Componente</th>
                  <th className="p-2">Subtema</th>
                  <th className="p-2">Dif.</th>
                  <th className="p-2">Enunciado</th>
                  <th className="p-2">Resp.</th>
                  <th className="p-2">Img.</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {preguntas.map((p) => (
                  <tr key={p.id} className="bg-white border-b border-gray-100">
                    <td className="p-2 text-sm font-mono text-gray-600">
                      {p.id}
                      {p.tarea && (
                        <span className="ml-1 text-[10px] text-gray-400">{p.tarea}</span>
                      )}
                    </td>
                    <td className="p-2 text-sm text-gray-500">{p.componente}</td>
                    <td className="p-2 text-sm text-gray-500">{p.subtema}</td>
                    <td className="p-2">
                      <span className={claseDificultad(p.dificultad)}>
                        {p.dificultad || '—'}
                      </span>
                    </td>
                    <td
                      className="p-2 text-xs text-gray-500 truncate max-w-xs"
                      title={p.pregunta}
                    >
                      {p.pregunta.substring(0, 60)}
                      {p.pregunta.length > 60 ? '…' : ''}
                    </td>
                    <td className="p-2 text-sm">
                      <span className="text-green-600 font-medium">
                        {p.respuesta_correcta ?? '—'}
                      </span>
                    </td>
                    <td className="p-2 text-xs text-gray-500">
                      {p.imagenes?.length ?? 0}
                      {p.opciones_en_imagen && (
                        <span className="ml-1 text-purple-700" title="Opciones en imagen">
                          A–D
                        </span>
                      )}
                    </td>
                    <td className="p-2">
                      <span className={claseEstado(p.estado)}>{p.estado}</span>
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <Link
                        href={`/panel/preguntas/${encodeURIComponent(p.id)}${
                          soloLectura ? '?banco=legacy' : ''
                        }`}
                        className="text-xs text-blue-600 hover:underline mr-3"
                      >
                        Ver
                      </Link>
                      <Link
                        href={`/panel/preguntas/${encodeURIComponent(p.id)}/editar${
                          soloLectura ? '?banco=legacy' : ''
                        }`}
                        className={`text-xs hover:underline ${
                          soloLectura ? 'text-gray-500' : 'text-yellow-700'
                        }`}
                      >
                        {soloLectura ? 'Consultar' : 'Editar'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalRegistros > 0 && totalPaginas > 1 && (
          <div className="mt-8 flex justify-center items-center gap-2">
            <button
              onClick={() => irPagina(filtros.page - 1)}
              disabled={filtros.page <= 1 || esCargando}
              className="py-2 px-4 rounded-md font-medium text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            >
              Anterior
            </button>

            <span className="text-sm text-gray-600">
              Página {filtros.page} de {totalPaginas} ({totalRegistros} preguntas)
            </span>

            <button
              onClick={() => irPagina(filtros.page + 1)}
              disabled={!hasMore || filtros.page >= totalPaginas || esCargando}
              className="py-2 px-4 rounded-md font-medium text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export type { FilaTabla, FiltrosState };
