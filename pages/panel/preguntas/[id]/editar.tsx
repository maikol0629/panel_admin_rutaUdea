/**
 * Página /panel/preguntas/[id]/editar — Edición de una pregunta v2.
 *
 * Carga el documento normalizado, lo convierte al shape editable y guarda
 * vía PUT. Con `?banco=legacy` abre el banco congelado en solo lectura.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAdminUser } from '@/hooks/useAdminUser';
import QuestionForm from '@/components/questions/QuestionForm';
import { aEditable, type PreguntaEditable } from '@/components/questions/types';
import { normalizarPregunta } from '@/lib/bank';
import AdminLayout from '@/components/layout/AdminLayout';

export default function EditarPreguntaPage() {
  const router = useRouter();
  const { id, banco } = router.query;
  const preguntaId = Array.isArray(id) ? (id[0] ?? '') : (id ?? '');
  const esLegacy = (Array.isArray(banco) ? banco[0] : banco) === 'legacy';
  const { idToken } = useAdminUser();
  const [usuario, setUsuario] = useState<User | null>(null);
  const [initial, setInitial] = useState<PreguntaEditable | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!idToken || !preguntaId) return;
    let cancelado = false;
    async function cargar() {
      try {
        const params = esLegacy ? '?banco=legacy' : '';
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
        if (!cancelado) {
          setInitial(aEditable(normalizarPregunta(preguntaId, data.pregunta)));
          setCargando(false);
        }
      } catch (err) {
        if (!cancelado) {
          setError(err instanceof Error ? err.message : 'Error inesperado');
          setCargando(false);
        }
      }
    }
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [idToken, preguntaId, esLegacy]);

  const guardar = useCallback(
    async (datos: PreguntaEditable) => {
      if (!idToken || !preguntaId) return;
      setGuardando(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/questions/${encodeURIComponent(preguntaId)}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify(datos),
          },
        );
        const data = (await res.json()) as {
          success?: boolean;
          error?: string;
          faltantes?: string[];
        };
        if (!res.ok || !data.success) {
          const detalle = data.faltantes?.length
            ? ` Faltan: ${data.faltantes.join(', ')}`
            : '';
          throw new Error(`${data.error ?? 'No se pudo guardar'}${detalle}`);
        }
        await router.replace(
          `/panel/preguntas/${encodeURIComponent(preguntaId)}`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error inesperado');
      } finally {
        setGuardando(false);
      }
    },
    [idToken, preguntaId, router],
  );

  return (
    <AdminLayout
      title={esLegacy ? 'Consultar pregunta' : 'Editar pregunta'}
      subtitle={esLegacy ? 'Banco legacy · solo lectura' : `ID ${preguntaId}`}
      user={usuario}
      backHref={`/panel/preguntas/${encodeURIComponent(preguntaId)}${
        esLegacy ? '?banco=legacy' : ''
      }`}
      maxWidth="4xl"
    >
        {cargando && <p className="text-sm text-gray-500">Cargando pregunta…</p>}
        {!cargando && error && !initial && (
          <div className="p-3 bg-red-50 rounded border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}
        {!cargando && initial && (
          <QuestionForm
            initial={initial}
            saving={guardando}
            serverError={error}
            soloLectura={esLegacy}
            onSubmit={guardar}
            onCancel={() =>
              router.push(
                `/panel/preguntas/${encodeURIComponent(preguntaId)}${
                  esLegacy ? '?banco=legacy' : ''
                }`,
              )
            }
          />
        )}
    </AdminLayout>
  );
}
