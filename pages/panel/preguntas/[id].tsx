/**
 * Página /panel/preguntas/[id] — Detalle de una pregunta (contrato v2).
 *
 * Muestra todos los campos relevantes: estado, versión, taxonomía,
 * contexto, imágenes con rol y metadatos de revisión. Permite aprobar,
 * devolver a pendiente, rechazar/cuarentena (con motivo) y deshabilitar
 * (borrado lógico). El banco legacy se muestra en solo lectura.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAdminUser } from '@/hooks/useAdminUser';
import { normalizarPregunta, type ImagenRef, type PreguntaV2 } from '@/lib/bank';
import AdminLayout from '@/components/layout/AdminLayout';

function Campo({ titulo, valor }: { titulo: string; valor: string }) {
  if (!valor) return null;
  return (
    <div>
      <h4 className="text-xs font-medium text-gray-400 uppercase">{titulo}</h4>
      <p className="text-sm text-gray-800 whitespace-pre-wrap mt-1">{valor}</p>
    </div>
  );
}

function claseEstado(estado: string): string {
  switch (estado) {
    case 'aprobado':
      return 'bg-green-100 text-green-700';
    case 'aprobado_con_imagen':
      return 'bg-emerald-100 text-emerald-700';
    case 'pendiente':
      return 'bg-yellow-100 text-yellow-700';
    case 'deshabilitado':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export default function PreguntaDetallePage() {
  const router = useRouter();
  const { id, banco } = router.query;
  const preguntaId = Array.isArray(id) ? (id[0] ?? '') : (id ?? '');
  const bancoParam =
    (Array.isArray(banco) ? banco[0] : banco) === 'legacy' ? 'legacy' : 'v2';
  const { idToken } = useAdminUser();
  const [usuario, setUsuario] = useState<User | null>(null);
  const [pregunta, setPregunta] = useState<PreguntaV2 | null>(null);
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
      const params = bancoParam === 'legacy' ? '?banco=legacy' : '';
      const res = await fetch(
        `/api/questions/${encodeURIComponent(preguntaId)}${params}`,
        { headers: { Authorization: `Bearer ${idToken}` } },
      );
      const data = (await res.json()) as {
        success?: boolean;
        pregunta?: Record<string, unknown>;
        error?: string;
      };
      if (!res.ok || !data.success || !data.pregunta) {
        throw new Error(data.error ?? 'No se pudo cargar la pregunta');
      }
      setPregunta(normalizarPregunta(preguntaId, data.pregunta));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setCargando(false);
    }
  }, [idToken, preguntaId, bancoParam]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const ejecutarAccion = async (
    accion: 'aprobar' | 'pendiente' | 'rechazar' | 'cuarentena' | 'deshabilitar',
    motivo?: string,
    estadoFinal?: 'aprobado' | 'aprobado_con_imagen',
  ) => {
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
        body: JSON.stringify({ accion, motivo, estado: estadoFinal }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        pregunta?: Record<string, unknown>;
        error?: string;
        faltantes?: string[];
      };
      if (!res.ok || !data.success || !data.pregunta) {
        const detalle = data.faltantes?.length
          ? ` Faltan: ${data.faltantes.join(', ')}`
          : '';
        throw new Error(`${data.error ?? 'No se pudo aplicar la acción'}${detalle}`);
      }
      setPregunta(normalizarPregunta(preguntaId, data.pregunta));
      setAviso(`Acción "${accion}" aplicada.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setAccionando(false);
    }
  };

  const aprobar = (conImagen: boolean) => {
    void ejecutarAccion(
      'aprobar',
      undefined,
      conImagen ? 'aprobado_con_imagen' : 'aprobado',
    );
  };

  const rechazar = () => {
    const motivo = window.prompt('Motivo del rechazo (obligatorio, queda en las notas):');
    if (!motivo?.trim()) return;
    void ejecutarAccion('rechazar', motivo.trim());
  };

  const deshabilitar = () => {
    const motivo = window.prompt(
      'Motivo para deshabilitar (obligatorio, queda en las notas):',
    );
    if (!motivo?.trim()) return;
    void ejecutarAccion('deshabilitar', motivo.trim());
  };

  const estado = pregunta?.estado ?? 'pendiente';
  const esLegacy = bancoParam === 'legacy';
  const imagenes: ImagenRef[] = pregunta?.imagenes ?? [];

  return (
    <AdminLayout
      title={preguntaId || 'Detalle de pregunta'}
      subtitle={esLegacy ? 'Banco legacy · solo lectura' : 'Detalle y revisión'}
      user={usuario}
      backHref="/panel/preguntas"
      maxWidth="4xl"
    >
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

      {!cargando && pregunta && (
        <>
          <div className="bg-white rounded-xl shadow-sm p-6 mb-4">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                {pregunta.area}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                {pregunta.subtema}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700">
                {pregunta.dificultad || 'sin dificultad'}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded ${claseEstado(estado)}`}>
                {estado}
              </span>
              {pregunta.opciones_en_imagen && (
                <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                  opciones en imagen
                </span>
              )}
              {pregunta.verificada && (
                <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700">
                  verificada
                </span>
              )}
              <span className="text-xs text-gray-400 font-mono">
                {pregunta.bank_version} · schema {pregunta.schema_version}
              </span>
              <span className="ml-auto">
                <a
                  href={`/panel/preguntas/${encodeURIComponent(preguntaId)}/editar${
                    esLegacy ? '?banco=legacy' : ''
                  }`}
                  className="text-sm text-blue-600 hover:underline font-medium"
                >
                  {esLegacy ? 'Consultar →' : 'Editar →'}
                </a>
              </span>
            </div>

            {pregunta.contexto && (
              <div className="mb-4 p-3 bg-slate-50 rounded text-sm text-gray-700 whitespace-pre-wrap">
                {pregunta.contexto}
              </div>
            )}

            <h1 className="text-lg font-semibold text-gray-900 whitespace-pre-wrap">
              {pregunta.pregunta}
            </h1>

            {imagenes.length > 0 && (
              <div className="mt-4 space-y-3">
                {imagenes.map((img, indice) => (
                  <div key={`${img.rol}-${indice}`}>
                    <p className="text-xs text-gray-500 mb-1">
                      Imagen de {img.rol} {img.orden}
                      {img.alt ? ` · ${img.alt}` : ''}
                    </p>
                    {img.url ? (
                      <img
                        src={img.url}
                        alt={img.alt ?? `Imagen de ${img.rol}`}
                        className="max-h-80 rounded border border-gray-200"
                      />
                    ) : (
                      <p className="text-xs text-red-600">Imagen sin URL publicada.</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {pregunta.imagen_url && imagenes.length === 0 && (
              <img
                src={pregunta.imagen_url}
                alt="Imagen de la pregunta"
                className="mt-4 max-h-80 rounded border border-gray-200"
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
              {(['A', 'B', 'C', 'D'] as const).map((letra) => {
                const esCorrecta = pregunta.respuesta_correcta === letra;
                return (
                  <div
                    key={letra}
                    className={`p-2 rounded border text-sm ${
                      esCorrecta
                        ? 'border-green-500 bg-green-50 font-medium'
                        : 'border-gray-200'
                    }`}
                  >
                    <span className="font-mono font-bold mr-2">{letra}.</span>
                    {pregunta.opciones[letra]}
                    {esCorrecta && (
                      <span className="ml-2 text-xs text-green-700">✓ correcta</span>
                    )}
                  </div>
                );
              })}
            </div>
            {!pregunta.respuesta_correcta && (
              <p className="mt-2 text-sm text-red-600">
                Sin respuesta definida — no se puede aprobar hasta definirla.
              </p>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
            <Campo titulo="Explicación" valor={pregunta.explicacion ?? ''} />
            <Campo titulo="Texto base" valor={pregunta.texto_base ?? ''} />
            <Campo
              titulo="IDs de contexto"
              valor={(pregunta.contexto_ids ?? []).join(', ')}
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <Campo titulo="Fuente" valor={pregunta.fuente ?? ''} />
              <Campo titulo="Tipo fuente" valor={pregunta.tipo_fuente ?? ''} />
              <Campo titulo="Tarea" valor={pregunta.tarea ?? ''} />
              <Campo
                titulo="Número"
                valor={pregunta.numero != null ? String(pregunta.numero) : ''}
              />
              <Campo titulo="Confianza modelo" valor={pregunta.confianza_modelo ?? ''} />
              <Campo titulo="Revisado por" valor={pregunta.revisado_por ?? ''} />
              <Campo titulo="Fecha revisión" valor={pregunta.fecha_revision ?? ''} />
              <Campo titulo="Notas" valor={pregunta.notas ?? ''} />
            </div>
          </div>

          {!esLegacy && (
            <div className="bg-white rounded-xl shadow-sm p-6 mt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Revisión</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => aprobar(false)}
                  disabled={accionando || estado === 'aprobado'}
                  className="py-2 px-4 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-40"
                >
                  Aprobar
                </button>
                <button
                  onClick={() => aprobar(true)}
                  disabled={accionando || estado === 'aprobado_con_imagen'}
                  className="py-2 px-4 rounded-md text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40"
                >
                  Aprobar con imagen
                </button>
                <button
                  onClick={() => ejecutarAccion('pendiente')}
                  disabled={accionando || estado === 'pendiente'}
                  className="py-2 px-4 rounded-md text-sm font-medium text-yellow-800 bg-yellow-100 hover:bg-yellow-200 disabled:opacity-40"
                >
                  A pendiente
                </button>
                <button
                  onClick={rechazar}
                  disabled={accionando || estado === 'deshabilitado'}
                  className="py-2 px-4 rounded-md text-sm font-medium text-orange-800 bg-orange-100 hover:bg-orange-200 disabled:opacity-40"
                >
                  Rechazar…
                </button>
                <button
                  onClick={deshabilitar}
                  disabled={accionando || estado === 'deshabilitado'}
                  className="py-2 px-4 rounded-md text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 disabled:opacity-40"
                >
                  Deshabilitar…
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Publicar exige taxonomía, 4 opciones, respuesta, verificación e imágenes
                con URL cuando la pregunta las requiera. Rechazar y deshabilitar piden
                motivo y se registran en las notas.
              </p>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
