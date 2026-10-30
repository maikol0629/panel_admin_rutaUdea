/**
 * Página /panel/contextos — Contextos compartidos (contexts_v2, D-05).
 *
 * Lista los contextos con sus imágenes y preguntas asociadas. Permite
 * editar texto, título, taxonomía y las URLs de las imágenes (rol contexto).
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAdminUser } from '@/hooks/useAdminUser';
import AdminLayout from '@/components/layout/AdminLayout';

interface ImagenContexto {
  url: string | null;
  rol?: string;
  orden?: number;
  alt?: string | null;
  path_origen?: string | null;
}

interface Contexto {
  id: string;
  area: string;
  componente: string;
  subtema: string;
  titulo: string | null;
  texto: string;
  imagenes: ImagenContexto[];
  preguntas_ids: string[];
}

interface Referencia {
  id: string;
  estado: string;
  pregunta: string;
}

const inputClase =
  'w-full rounded-md border-gray-300 shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500';

export default function ContextosPage() {
  const router = useRouter();
  const { idToken } = useAdminUser();
  const [usuario, setUsuario] = useState<User | null>(null);
  const [contextos, setContextos] = useState<Contexto[]>([]);
  const [resumen, setResumen] = useState<Record<string, number> | null>(null);
  const [area, setArea] = useState('');
  const [search, setSearch] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<Contexto | null>(null);
  const [referencias, setReferencias] = useState<Referencia[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        void router.replace('/auth/login');
        return;
      }
      setUsuario(user);
    });
    return () => unsub();
  }, [router]);

  const cargar = useCallback(async () => {
    if (!idToken) return;
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (area) params.set('area', area);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/contexts?${params.toString()}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = (await res.json()) as {
        success?: boolean;
        contextos?: Contexto[];
        resumen?: Record<string, number>;
        error?: string;
      };
      if (!res.ok || !data.success || !data.contextos) {
        throw new Error(data.error ?? 'No se pudieron cargar los contextos');
      }
      setContextos(data.contextos);
      setResumen(data.resumen ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setCargando(false);
    }
  }, [idToken, area, search]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abrir = async (contexto: Contexto) => {
    setSeleccionado({ ...contexto });
    setReferencias([]);
    if (!idToken) return;
    try {
      const res = await fetch(`/api/contexts/${encodeURIComponent(contexto.id)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = (await res.json()) as {
        success?: boolean;
        preguntas?: Referencia[];
      };
      if (data.success && data.preguntas) setReferencias(data.preguntas);
    } catch {
      // La lista de referencias es informativa.
    }
  };

  const set = <K extends keyof Contexto>(campo: K, valor: Contexto[K]) => {
    setSeleccionado((prev) => (prev ? { ...prev, [campo]: valor } : prev));
  };

  const setImagen = (indice: number, cambios: Partial<ImagenContexto>) => {
    setSeleccionado((prev) =>
      prev
        ? {
            ...prev,
            imagenes: prev.imagenes.map((img, i) =>
              i === indice ? { ...img, ...cambios } : img,
            ),
          }
        : prev,
    );
  };

  const guardar = async () => {
    if (!idToken || !seleccionado) return;
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/contexts/${encodeURIComponent(seleccionado.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          area: seleccionado.area,
          subtema: seleccionado.subtema,
          titulo: seleccionado.titulo,
          texto: seleccionado.texto,
          imagenes: seleccionado.imagenes,
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'No se pudo guardar el contexto');
      }
      setAviso(`Contexto ${seleccionado.id} guardado.`);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AdminLayout
      title="Contextos compartidos"
      subtitle="Textos e imágenes reutilizables del banco"
      user={usuario}
      backHref="/panel"
    >
      {resumen && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            ['Contextos', resumen['total'] ?? 0],
            ['Con imagen', resumen['conImagen'] ?? 0],
            ['Con 2+ imágenes', resumen['conMultiples'] ?? 0],
            [
              'RL / CL',
              `${resumen['razonamiento_logico'] ?? 0} / ${resumen['competencia_lectora'] ?? 0}`,
            ],
          ].map(([etiqueta, valor]) => (
            <div key={String(etiqueta)} className="bg-white rounded-lg p-3">
              <p className="text-xs text-gray-500">{etiqueta}</p>
              <p className="text-lg font-semibold text-gray-800">{valor}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div className="w-48">
          <label className="block text-xs text-gray-500 mb-1">Área</label>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className={inputClase}
          >
            <option value="">-- Todas --</option>
            <option value="razonamiento_logico">Razonamiento Lógico</option>
            <option value="competencia_lectora">Competencia Lectora</option>
          </select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-gray-500 mb-1">Buscar</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ID, título, texto o subtema"
            className={inputClase}
          />
        </div>
        <button
          onClick={() => void cargar()}
          className="py-2 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          Aplicar
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 rounded border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}
      {aviso && (
        <div className="mb-4 p-3 bg-green-50 rounded border border-green-200 text-green-700 text-sm">
          {aviso}
        </div>
      )}
      {cargando && <p className="text-sm text-gray-500">Cargando contextos…</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {contextos.map((contexto) => (
          <button
            key={contexto.id}
            onClick={() => void abrir(contexto)}
            className={`text-left bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow ${
              seleccionado?.id === contexto.id ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-sm text-gray-700">{contexto.id}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                {contexto.area}
              </span>
              <span className="text-xs text-gray-400">{contexto.subtema}</span>
              {contexto.imagenes.length > 0 && (
                <span className="ml-auto text-xs text-cyan-700">
                  {contexto.imagenes.length} imagen(es)
                </span>
              )}
            </div>
            {contexto.titulo && (
              <p className="text-sm font-medium text-gray-800">{contexto.titulo}</p>
            )}
            <p className="text-xs text-gray-500 line-clamp-3 whitespace-pre-wrap">
              {contexto.texto}
            </p>
            <p className="text-xs text-gray-400 mt-2">
              {contexto.preguntas_ids.length} pregunta(s) asociada(s)
            </p>
          </button>
        ))}
      </div>

      {!cargando && contextos.length === 0 && (
        <p className="text-center text-gray-500 mt-8">
          No hay contextos con los filtros aplicados.
        </p>
      )}

      {seleccionado && (
        <section className="mt-8 bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-800 font-mono">
              {seleccionado.id}
            </h3>
            <button
              onClick={() => setSeleccionado(null)}
              className="text-sm text-gray-500 hover:underline"
            >
              Cerrar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Área</label>
              <select
                value={seleccionado.area}
                onChange={(e) => set('area', e.target.value)}
                className={inputClase}
              >
                <option value="razonamiento_logico">Razonamiento Lógico</option>
                <option value="competencia_lectora">Competencia Lectora</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Subtema</label>
              <input
                value={seleccionado.subtema}
                onChange={(e) => set('subtema', e.target.value)}
                className={inputClase}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Título</label>
            <input
              value={seleccionado.titulo ?? ''}
              onChange={(e) => set('titulo', e.target.value || null)}
              className={inputClase}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Texto</label>
            <textarea
              value={seleccionado.texto}
              onChange={(e) => set('texto', e.target.value)}
              rows={5}
              className={inputClase}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Imágenes</p>
            {seleccionado.imagenes.length === 0 && (
              <p className="text-xs text-gray-500">Sin imágenes.</p>
            )}
            {seleccionado.imagenes.map((imagen, indice) => (
              <div
                key={indice}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
              >
                <div className="sm:col-span-6">
                  <label className="block text-xs text-gray-500 mb-1">URL</label>
                  <input
                    value={imagen.url ?? ''}
                    onChange={(e) =>
                      setImagen(indice, { url: e.target.value.trim() || null })
                    }
                    className={`${inputClase} font-mono`}
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-xs text-gray-500 mb-1">
                    Texto alternativo
                  </label>
                  <input
                    value={imagen.alt ?? ''}
                    onChange={(e) =>
                      setImagen(indice, { alt: e.target.value.trim() || null })
                    }
                    className={inputClase}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Orden</label>
                  <input
                    type="number"
                    value={imagen.orden ?? indice + 1}
                    onChange={(e) =>
                      setImagen(indice, { orden: Number(e.target.value) || indice + 1 })
                    }
                    className={inputClase}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void guardar()}
              disabled={guardando}
              className="py-2 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : 'Guardar contexto'}
            </button>
            <a
              href={`/panel/preguntas?subtema=${encodeURIComponent(
                seleccionado.subtema,
              )}`}
              className="py-2 px-4 rounded-md text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
            >
              Ver preguntas del subtema
            </a>
          </div>

          {referencias.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Preguntas que usan este contexto
              </p>
              <ul className="space-y-1">
                {referencias.map((ref) => (
                  <li key={ref.id} className="text-xs text-gray-600">
                    <a
                      href={`/panel/preguntas/${encodeURIComponent(ref.id)}`}
                      className="text-blue-600 hover:underline font-mono"
                    >
                      {ref.id}
                    </a>
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100">
                      {ref.estado}
                    </span>
                    <span className="ml-2 text-gray-400">
                      {ref.pregunta.slice(0, 70)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </AdminLayout>
  );
}
