/**
 * Página /panel/preguntas/[id] — Detalle de una pregunta.
 *
 * Muestra todos los campos, permite cambiar el estado
 * (aprobar / pendiente / deshabilitar) y enlaza a la edición.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAdminUser } from '@/hooks/useAdminUser';

type Doc = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function Campo({ titulo, valor }: { titulo: string; valor: string }) {
  if (!valor) return null;
  return (
    <div>
      <h4 className="text-xs font-medium text-gray-400 uppercase">{titulo}</h4>
      <p className="text-sm text-gray-800 whitespace-pre-wrap mt-1">{valor}</p>
    </div>
  );
}

export default function PreguntaDetallePage() {
  const router = useRouter();
  const { id } = router.query;
  const preguntaId = Array.isArray(id) ? (id[0] ?? '') : (id ?? '');
  const { idToken } = useAdminUser();
  const [usuario, setUsuario] = useState<User | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [cargando, setCargando] = useState(true);
  const [accionando, setAccionando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

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
    if (!idToken || !preguntaId) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/questions/${encodeURIComponent(preguntaId)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = (await res.json()) as {
        success?: boolean;
        pregunta?: Doc;
        error?: string;
      };
      if (!res.ok || !data.success || !data.pregunta) {
        throw new Error(data.error ?? 'No se pudo cargar la pregunta');
      }
      setDoc(data.pregunta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setCargando(false);
    }
  }, [idToken, preguntaId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cambiarEstado = async (estado: string) => {
    if (!idToken || !preguntaId) return;
    setAccionando(true);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/questions/${encodeURIComponent(preguntaId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ estado }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        pregunta?: Doc;
        error?: string;
        faltantes?: string[];
      };
      if (!res.ok || !data.success || !data.pregunta) {
        throw new Error(
          data.faltantes
            ? `${data.error ?? 'No se pudo cambiar el estado'}`
            : (data.error ?? 'No se pudo cambiar el estado'),
        );
      }
      setDoc(data.pregunta);
      setAviso(`Estado cambiado a "${estado}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setAccionando(false);
    }
  };

  const deshabilitar = async () => {
    if (!idToken || !preguntaId) return;
    if (!window.confirm('¿Deshabilitar esta pregunta? Dejará de sincronizarse a la app.')) {
      return;
    }
    setAccionando(true);
    setError(null);
    try {
      const res = await fetch(`/api/questions/${encodeURIComponent(preguntaId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = (await res.json()) as {
        success?: boolean;
        pregunta?: Doc;
        error?: string;
      };
      if (!res.ok || !data.success || !data.pregunta) {
        throw new Error(data.error ?? 'No se pudo deshabilitar');
      }
      setDoc(data.pregunta);
      setAviso('Pregunta deshabilitada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setAccionando(false);
    }
  };

  const cerrarSesion = () => {
    signOut(auth).finally(() => {
      void router.replace('/auth/login');
    });
  };

  const estado = str(doc?.['estado']) || 'pendiente';
  const opciones = (doc?.['opciones'] as Record<string, unknown> | undefined) ?? {};

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/panel/preguntas" className="text-sm text-blue-600 hover:underline">
              ← Preguntas
            </a>
            <h2 className="text-xl font-semibold text-gray-900 font-mono">
              {preguntaId || '…'}
            </h2>
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

      <main className="p-6 sm:p-8 max-w-4xl mx-auto">
        {cargando && <p className="text-sm text-gray-500">Cargando pregunta…</p>}

        {error && (
          <div className="p-3 mb-4 bg-red-50 rounded border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}
        {aviso && (
          <div className="p-3 mb-4 bg-green-50 rounded border border-green-200 text-green-700 text-sm">
            {aviso}
          </div>
        )}

        {!cargando && doc && (
          <>
            <div className="bg-white rounded-xl shadow-sm p-6 mb-4">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                  {str(doc['area'])}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                  {str(doc['subtema'])}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700">
                  {str(doc['dificultad'])}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">
                  {estado}
                </span>
                <span className="ml-auto">
                  <a
                    href={`/panel/preguntas/${encodeURIComponent(preguntaId)}/editar`}
                    className="text-sm text-blue-600 hover:underline font-medium"
                  >
                    Editar →
                  </a>
                </span>
              </div>

              <h1 className="text-lg font-semibold text-gray-900 whitespace-pre-wrap">
                {str(doc['pregunta'])}
              </h1>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                {(['A', 'B', 'C', 'D'] as const).map((l) => {
                  const esCorrecta = str(doc['respuesta_correcta']) === l;
                  return (
                    <div
                      key={l}
                      className={`p-2 rounded border text-sm ${
                        esCorrecta
                          ? 'border-green-500 bg-green-50 font-medium'
                          : 'border-gray-200'
                      }`}
                    >
                      <span className="font-mono font-bold mr-2">{l}.</span>
                      {str(opciones[l])}
                      {esCorrecta && (
                        <span className="ml-2 text-xs text-green-700">✓ correcta</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {!str(doc['respuesta_correcta']) && (
                <p className="mt-2 text-sm text-red-600">
                  Sin respuesta definida — no se puede aprobar hasta definirla.
                </p>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <Campo titulo="Explicación" valor={str(doc['explicacion'])} />
              <Campo titulo="Competencia" valor={str(doc['competencia'])} />
              <Campo titulo="Contexto" valor={str(doc['contexto'])} />
              <Campo titulo="Texto base" valor={str(doc['texto_base'])} />
              <Campo titulo="Tipo de texto" valor={str(doc['tipo_texto'])} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <Campo titulo="Fuente" valor={str(doc['fuente'])} />
                <Campo titulo="Tipo fuente" valor={str(doc['tipo_fuente'])} />
                <Campo
                  titulo="Original"
                  valor={doc['es_original'] ? 'Sí' : 'No'}
                />
                <Campo
                  titulo="Verificada"
                  valor={doc['verificada'] ? 'Sí' : 'No'}
                />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 mt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Cambiar estado
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => cambiarEstado('aprobado')}
                  disabled={accionando || estado === 'aprobado'}
                  className="py-2 px-4 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-40"
                >
                  Aprobar
                </button>
                <button
                  onClick={() => cambiarEstado('pendiente')}
                  disabled={accionando || estado === 'pendiente'}
                  className="py-2 px-4 rounded-md text-sm font-medium text-yellow-800 bg-yellow-100 hover:bg-yellow-200 disabled:opacity-40"
                >
                  A pendiente
                </button>
                <button
                  onClick={deshabilitar}
                  disabled={accionando || estado === 'deshabilitado'}
                  className="py-2 px-4 rounded-md text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 disabled:opacity-40"
                >
                  Deshabilitar
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Solo las preguntas en estado “aprobado” se sincronizan a la app
                móvil. Aprobar exige enunciado, 4 opciones y respuesta definida.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
