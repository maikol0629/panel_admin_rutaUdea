/**
 * Página /panel/preguntas/[id]/editar — Edición completa de una pregunta.
 *
 * Carga el documento, lo normaliza al shape del formulario (tolerando los
 * campos opcionales ausentes del banco real) y guarda vía PUT.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAdminUser } from '@/hooks/useAdminUser';
import QuestionForm from '@/components/questions/QuestionForm';
import type { PreguntaEditable } from '@/components/questions/types';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function normalizar(doc: Record<string, unknown>): PreguntaEditable {
  const opciones = (doc['opciones'] as Record<string, unknown> | undefined) ?? {};
  const resp = doc['respuesta_correcta'];
  return {
    id: str(doc['id']),
    area: str(doc['area'], 'razonamiento_logico'),
    subtema: str(doc['subtema']),
    dificultad: str(doc['dificultad'], 'media'),
    pregunta: str(doc['pregunta']),
    opciones: {
      A: str(opciones['A']),
      B: str(opciones['B']),
      C: str(opciones['C']),
      D: str(opciones['D']),
    },
    respuesta_correcta:
      typeof resp === 'string' && resp.trim() ? resp.trim().toUpperCase() : null,
    explicacion: str(doc['explicacion']),
    competencia: str(doc['competencia']) || undefined,
    contexto: str(doc['contexto']) || undefined,
    texto_base: str(doc['texto_base']) || undefined,
    tipo_texto: str(doc['tipo_texto']) || undefined,
    fuente: str(doc['fuente']) || undefined,
    tipo_fuente: str(doc['tipo_fuente']) || undefined,
    es_original: doc['es_original'] === true,
    verificada: doc['verificada'] === true,
    duplicado: doc['duplicado'] === true,
    estado: ((): PreguntaEditable['estado'] => {
      const e = str(doc['estado']);
      return e === 'aprobado' || e === 'deshabilitado' ? e : 'pendiente';
    })(),
  };
}

export default function EditarPreguntaPage() {
  const router = useRouter();
  const { id } = router.query;
  const preguntaId = Array.isArray(id) ? (id[0] ?? '') : (id ?? '');
  const { idToken } = useAdminUser();
  const [, setUsuario] = useState<User | null>(null);
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
        const res = await fetch(`/api/questions/${encodeURIComponent(preguntaId)}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = (await res.json()) as {
          success?: boolean;
          pregunta?: Record<string, unknown>;
          error?: string;
        };
        if (!res.ok || !data.success || !data.pregunta) {
          throw new Error(data.error ?? 'No se pudo cargar la pregunta');
        }
        if (!cancelado) {
          setInitial(normalizar(data.pregunta));
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
  }, [idToken, preguntaId]);

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
          throw new Error(
            data.faltantes
              ? `${data.error ?? 'No se pudo guardar'}`
              : (data.error ?? 'No se pudo guardar'),
          );
        }
        await router.replace(`/panel/preguntas/${encodeURIComponent(preguntaId)}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error inesperado');
      } finally {
        setGuardando(false);
      }
    },
    [idToken, preguntaId, router],
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href={`/panel/preguntas/${encodeURIComponent(preguntaId)}`}
              className="text-sm text-blue-600 hover:underline"
            >
              ← Detalle
            </a>
            <h2 className="text-xl font-semibold text-gray-900">
              Editar pregunta
            </h2>
          </div>
          <span className="text-sm text-gray-600 font-mono">{preguntaId}</span>
        </div>
      </nav>

      <main className="p-6 sm:p-8 max-w-4xl mx-auto">
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
            onSubmit={guardar}
            onCancel={() =>
              router.push(`/panel/preguntas/${encodeURIComponent(preguntaId)}`)
            }
          />
        )}
      </main>
    </div>
  );
}
