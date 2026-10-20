/**
 * Componente QuestionsList - Lista de preguntas con filtros y búsqueda.
 *
 * Consume GET /api/questions con filtros (área, subtema, dificultad,
 * estado), búsqueda textual, ordenamiento y paginación por página.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAdminUser } from '@/hooks/useAdminUser';

interface FilaTabla {
  id: string;
  area: string;
  componente: string;
  subtema: string;
  dificultad: string;
  pregunta: string;
  respuesta_correcta: string;
  estado: string;
}

interface FiltrosState {
  area: string;
  subtema: string;
  dificultad: string;
  estado: string;
  search: string;
  id: string;
  orderBy: string;
  orderDir: 'asc' | 'desc';
  page: number;
  limit: number;
  soloIncompletas: boolean;
}

interface ListadoResponse {
  success?: boolean;
  preguntas?: FilaTabla[];
  total?: number;
  totalIncompletas?: number;
  page?: number;
  totalPages?: number;
  hasMore?: boolean;
  error?: string;
}

const FILTROS_INICIALES: FiltrosState = {
  area: '',
  subtema: '',
  dificultad: '',
  estado: '',
  search: '',
  id: '',
  orderBy: 'id',
  orderDir: 'asc',
  page: 1,
  limit: 20,
  soloIncompletas: false,
};

const SUBTEMAS_SUGERIDOS = [
  'Proporcionalidad',
  'Porcentajes',
  'Relaciones espaciales',
];

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
  const router = useRouter();
  const { firebaseUser, idToken } = useAdminUser();
  const [filtros, setFiltros] = useState<FiltrosState>(FILTROS_INICIALES);
  const [preguntas, setPreguntas] = useState<FilaTabla[]>([]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalIncompletas, setTotalIncompletas] = useState(0);
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
        if (f.area) params.set('area', f.area);
        if (f.subtema) params.set('subtema', f.subtema);
        if (f.dificultad) params.set('dificultad', f.dificultad);
        if (f.estado) params.set('estado', f.estado);
        if (f.search.trim()) params.set('search', f.search.trim());
        if (f.id.trim()) params.set('id', f.id.trim());
        if (f.soloIncompletas) params.set('incompletas', 'true');
        params.set('orderBy', f.orderBy);
        params.set('orderDir', f.orderDir);
        params.set('limit', String(f.limit));
        params.set('page', String(f.page));

        const response = await fetch(`/api/questions?${params.toString()}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = (await response.json()) as ListadoResponse;
        if (!response.ok || !data.success || !data.preguntas) {
          throw new Error(data.error ?? 'Error al cargar preguntas');
        }
        setPreguntas(data.preguntas);
        setTotalRegistros(data.total ?? 0);
        setTotalIncompletas(data.totalIncompletas ?? 0);
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
    void cargarPreguntas(filtros);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargarPreguntas, filtros.page, filtros.limit]);

  const actualizarFiltro = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFiltros((prev) => ({
      ...prev,
      [name]: name === 'limit' || name === 'page' ? Number(value) : value,
      page: name === 'page' || name === 'limit' ? Number(value) || 1 : 1,
    }));
  };

  const aplicarFiltros = (e: FormEvent) => {
    e.preventDefault();
    setFiltros((prev) => ({ ...prev, page: 1 }));
    void cargarPreguntas({ ...filtros, page: 1 });
  };

  const irPagina = (nueva: number) => {
    const siguiente = { ...filtros, page: nueva };
    setFiltros(siguiente);
    void cargarPreguntas(siguiente);
  };

  const cerrarSesion = () => {
    signOut(auth).finally(() => {
      void router.replace('/auth/login');
    });
  };

  return (
    <div>
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-500">
            Filtros y Búsqueda de Preguntas
          </h3>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {firebaseUser?.displayName ?? firebaseUser?.email ?? 'Admin'}
            </span>
            <button
              onClick={cerrarSesion}
              className="text-sm text-red-600 hover:underline"
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        <form
          onSubmit={aplicarFiltros}
          className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Área
            </label>
            <select
              name="area"
              value={filtros.area}
              onChange={actualizarFiltro}
              className={inputClase}
              disabled={esCargando}
            >
              <option value="">-- Todos --</option>
              <option value="razonamiento_logico">Razonamiento Lógico (RL)</option>
              <option value="competencia_lectora">Competencia Lectora (CL)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subtema
            </label>
            <select
              name="subtema"
              value={filtros.subtema}
              onChange={actualizarFiltro}
              className={inputClase}
              disabled={esCargando}
            >
              <option value="">-- Todos --</option>
              {SUBTEMAS_SUGERIDOS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
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
              disabled={esCargando}
            >
              <option value="">-- Todos --</option>
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
              disabled={esCargando}
            >
              <option value="">-- Todos --</option>
              <option value="aprobado">Aprobado</option>
              <option value="pendiente">Pendiente</option>
              <option value="deshabilitado">Deshabilitado</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Búsqueda de texto
            </label>
            <input
              type="text"
              name="search"
              value={filtros.search}
              onChange={actualizarFiltro}
              placeholder="Ej: proporcionalidad, tanque, avión…"
              className={inputClase}
              disabled={esCargando}
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filtrar por ID
            </label>
            <input
              type="text"
              name="id"
              value={filtros.id}
              onChange={actualizarFiltro}
              placeholder="Ej: profe_alex_1, RL-0042…"
              className={`${inputClase} font-mono`}
              disabled={esCargando}
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ordenar por
            </label>
            <select
              name="orderBy"
              value={filtros.orderBy}
              onChange={actualizarFiltro}
              className={inputClase}
              disabled={esCargando}
            >
              <option value="id">ID</option>
              <option value="componente">Componente</option>
              <option value="dificultad">Dificultad</option>
              <option value="pregunta">Enunciado (A-Z)</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Preguntas por página
            </label>
            <select
              name="limit"
              value={filtros.limit}
              onChange={actualizarFiltro}
              className={inputClase}
              disabled={esCargando}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>

          <div className="lg:col-span-2 pt-2 flex items-end gap-2">
            <button
              type="submit"
              disabled={esCargando}
              className="flex-1 py-2 px-4 rounded-md font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              Aplicar filtros
            </button>
          </div>

          <div className="lg:col-span-6 flex items-center gap-2">
            <input
              id="f-incompletas"
              type="checkbox"
              name="soloIncompletas"
              checked={filtros.soloIncompletas}
              onChange={(e) =>
                setFiltros((prev) => ({
                  ...prev,
                  soloIncompletas: e.target.checked,
                  page: 1,
                }))
              }
              className="h-4 w-4"
            />
            <label htmlFor="f-incompletas" className="text-sm text-gray-700">
              Solo incompletas (banco sucio: sin enunciado, opciones vacías o
              sin respuesta)
              {totalIncompletas > 0 && (
                <span className="ml-2 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded">
                  {totalIncompletas} por corregir
                </span>
              )}
            </label>
          </div>
        </form>
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
                <th className="p-2">Dificultad</th>
                <th className="p-2">Enunciado</th>
                <th className="p-2">Resp.</th>
                <th className="p-2">Estado</th>
                <th className="p-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {preguntas.map((p) => (
                <tr key={p.id} className="bg-white border-b border-gray-100">
                  <td className="p-2 text-sm font-mono text-gray-600">{p.id}</td>
                  <td className="p-2 text-sm text-gray-500">{p.componente}</td>
                  <td className="p-2 text-sm text-gray-500">{p.subtema}</td>
                  <td className="p-2">
                    <span className={claseDificultad(p.dificultad)}>
                      {p.dificultad}
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
                      {p.respuesta_correcta}
                    </span>
                  </td>
                  <td className="p-2">
                    <span className={claseEstado(p.estado)}>{p.estado}</span>
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <Link
                      href={`/panel/preguntas/${encodeURIComponent(p.id)}`}
                      className="text-xs text-blue-600 hover:underline mr-3"
                    >
                      Ver
                    </Link>
                    <Link
                      href={`/panel/preguntas/${encodeURIComponent(p.id)}/editar`}
                      className="text-xs text-yellow-700 hover:underline"
                    >
                      Editar
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
  );
}

export type { FilaTabla, FiltrosState };
