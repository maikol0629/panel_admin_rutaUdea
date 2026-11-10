/**
 * Página /panel/preguntas/[id] — Detalle de una pregunta (contrato v2).
 *
 * Presenta la pregunta como un alumno la ve en el examen (enunciado,
 * imágenes reales, opciones con respuesta correcta, explicación). Los
 * metadatos técnicos (ID, versión, schema, estado, etc.) se ocultan por
 * defecto y solo se revelan si el revisor los necesita.
 *
 * Permite aprobar, devolver a pendiente, rechazar/cuarentena y deshabilitar.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAdminUser } from '@/hooks/useAdminUser';
import { normalizarPregunta, type PreguntaV2 } from '@/lib/bank';
import PreguntaExamenCard from '@/components/questions/PreguntaExamenCard';
import HistorialPregunta from '@/components/history/HistorialPregunta';
import AdminLayout from '@/components/layout/AdminLayout';

export default function PreguntaDetallePage() {
  const router = useRouter();
  const { id, banco, reporteId: reporteIdQuery } = router.query;
  const preguntaId = Array.isArray(id) ? (id[0] ?? '') : (id ?? '');
  const bancoParam =
    (Array.isArray(banco) ? banco[0] : banco) === 'legacy' ? 'legacy' : 'v2';
  const reporteId = Array.isArray(reporteIdQuery)
    ? (reporteIdQuery[0] ?? '')
    : (reporteIdQuery ?? '');
  const { idToken } = useAdminUser();
  const [usuario, setUsuario] = useState<User | null>(null);
  const [pregunta, setPregunta] = useState<PreguntaV2 | null>(null);
  const [cargando, setCargando] = useState(true);
  const [accionando, setAccionando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mostrarMetadatos, setMostrarMetadatos] = useState(false);
  const [historialVersion, setHistorialVersion] = useState(0);

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
        body: JSON.stringify({
          accion,
          motivo,
          estado: estadoFinal,
          reporteId: reporteId || undefined,
        }),
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
      setHistorialVersion((valor) => valor + 1);
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

  const esLegacy = bancoParam === 'legacy';
  const estado = pregunta?.estado ?? 'pendiente';

  return (
    <AdminLayout
      title={preguntaId || 'Detalle de pregunta'}
      subtitle={esLegacy ? 'Banco legacy · solo lectura' : 'Revisión de pregunta'}
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
          {/* Botón para mostrar/ocultar metadatos técnicos */}
          <div className="mb-4 flex justify-between items-center">
            <button
              type="button"
              onClick={() => setMostrarMetadatos((prev) => !prev)}
              className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1 underline-offset-2 hover:underline"
            >
              {mostrarMetadatos ? 'Ocultar' : 'Mostrar'} información técnica
            </button>
          </div>

          <PreguntaExamenCard
            pregunta={pregunta}
            mostrarMetadatos={mostrarMetadatos}
            onEditar={
              !esLegacy
                ? () =>
                    void router.push(
                      `/panel/preguntas/${encodeURIComponent(preguntaId)}/editar${
                        reporteId ? `?reporteId=${encodeURIComponent(reporteId)}` : ''
                      }`,
                    )
                : undefined
            }
          />

          {!esLegacy && (
            <div className="bg-white rounded-xl shadow-sm p-6 mt-6">
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

          {!esLegacy && (
            <HistorialPregunta
              key={`${preguntaId}-${historialVersion}`}
              preguntaId={preguntaId}
              reporteId={reporteId || null}
            />
          )}
        </>
      )}
    </AdminLayout>
  );
}
