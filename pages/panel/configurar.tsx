/**
 * Página /panel/configurar
 *
 * Permite al administrador configurar los parámetros del simulacro:
 * - Tiempo máximo del simulacro (120 min por defecto)
 * - Tiempo máximo de inactividad antes de cerrar el simulacro
 * - Política de repetición de preguntas entre simulacros
 * - Distribución de dificultad (porcentajes por dificultad)
 *
 * Los cambios se guardan en Firestore colección `settings`, documento `config`.
 */

import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAdminUser } from '@/hooks/useAdminUser';

interface DistribucionDificultad {
  baja: number;
  media: number;
  alta: number;
}

interface SimulacroConfig {
  tiempo_simulacro_minutos: number;
  inactividad_max_minutos: number;
  politica_repeticion: 'ultimos_3' | 'sin_repeticion' | 'relajada';
  distribucion_dificultad: DistribucionDificultad;
}

const CONFIG_INICIAL: SimulacroConfig = {
  tiempo_simulacro_minutos: 120,
  inactividad_max_minutos: 30,
  politica_repeticion: 'ultimos_3',
  distribucion_dificultad: { baja: 25, media: 50, alta: 25 },
};

export default function ConfigurarPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<User | null>(null);
  const { idToken } = useAdminUser();
  const [config, setConfig] = useState<SimulacroConfig>(CONFIG_INICIAL);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

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
    if (!idToken) return;
    let cancelado = false;

    async function cargarConfig() {
      try {
        const response = await fetch('/api/settings', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!response.ok) {
          const errData = (await response.json()) as { error?: string };
          throw new Error(errData.error ?? 'Error al cargar configuración');
        }
        const data = (await response.json()) as { config: SimulacroConfig };
        if (!cancelado) {
          setConfig({ ...CONFIG_INICIAL, ...data.config });
          setCargando(false);
        }
      } catch (err) {
        if (!cancelado) {
          setError(err instanceof Error ? err.message : 'Error inesperado');
          setCargando(false);
        }
      }
    }

    void cargarConfig();
    return () => {
      cancelado = true;
    };
  }, [idToken]);

  const manejarCambio = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    if (name === 'distribucion_baja' || name === 'distribucion_media' || name === 'distribucion_alta') {
      const campo =
        name === 'distribucion_baja'
          ? 'baja'
          : name === 'distribucion_media'
            ? 'media'
            : 'alta';
      setConfig((prev) => ({
        ...prev,
        distribucion_dificultad: {
          ...prev.distribucion_dificultad,
          [campo]: Number(value),
        },
      }));
      return;
    }

    if (name === 'tiempo_simulacro_minutos' || name === 'inactividad_max_minutos') {
      setConfig((prev) => ({ ...prev, [name]: Number(value) }));
      return;
    }

    if (name === 'politica_repeticion') {
      const politica = value as SimulacroConfig['politica_repeticion'];
      setConfig((prev) => ({ ...prev, politica_repeticion: politica }));
    }
  };

  const guardarConfig = async (e: FormEvent) => {
    e.preventDefault();
    if (!idToken) {
      setError('Sesión no válida. Vuelva a iniciar sesión.');
      return;
    }

    setGuardando(true);
    setError(null);
    setExito(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const errData = (await response.json()) as { error?: string };
        throw new Error(errData.error ?? 'Error al guardar configuración');
      }

      const data = (await response.json()) as { config: SimulacroConfig };
      setConfig({ ...CONFIG_INICIAL, ...data.config });
      setExito('Configuración guardada exitosamente.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error inesperado al guardar',
      );
    } finally {
      setGuardando(false);
    }
  };

  const cerrarSesion = () => {
    signOut(auth).finally(() => {
      void router.replace('/auth/login');
    });
  };

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p>Cargando configuración…</p>
      </div>
    );
  }

  const sumaDistribucion =
    config.distribucion_dificultad.baja +
    config.distribucion_dificultad.media +
    config.distribucion_dificultad.alta;

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-purple-600 flex items-center justify-center">
              <span className="text-white font-bold uppercase text-xs">CONF</span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Configurar Simulacro
              </h2>
              <p className="text-sm text-gray-500">Parámetros del examen de admisión</p>
            </div>
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
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Configuración del Simulacro
        </h1>

        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md mb-6">
            {error}
          </div>
        )}

        {exito && (
          <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded-md mb-6">
            {exito}
          </div>
        )}

        <form
          onSubmit={guardarConfig}
          className="bg-white rounded-xl shadow-sm p-8 space-y-6 max-w-2xl"
        >
          <div>
            <label
              htmlFor="tiempo_simulacro_minutos"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Tiempo simulacro (minutos)
            </label>
            <p className="text-sm text-gray-500 mb-2">
              Duración total del simulacro en minutos. El valor por defecto es 120
              (2 horas).
            </p>
            <input
              id="tiempo_simulacro_minutos"
              type="number"
              name="tiempo_simulacro_minutos"
              value={config.tiempo_simulacro_minutos}
              onChange={manejarCambio}
              min="10"
              max="480"
              step="5"
              className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 block text-sm text-gray-900"
              placeholder="120"
              required
            />
          </div>

          <div>
            <label
              htmlFor="inactividad_max_minutos"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Inactividad máxima (minutos)
            </label>
            <p className="text-sm text-gray-500 mb-2">
              Tiempo sin actividad del usuario que dispara el cierre del simulacro.
            </p>
            <input
              id="inactividad_max_minutos"
              type="number"
              name="inactividad_max_minutos"
              value={config.inactividad_max_minutos}
              onChange={manejarCambio}
              min="1"
              max="60"
              step="1"
              className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 block text-sm text-gray-900"
              placeholder="30"
              required
            />
          </div>

          <div>
            <label
              htmlFor="politica_repeticion"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Política de repetición
            </label>
            <p className="text-sm text-gray-500 mb-2">
              Controla si preguntas de simulacros anteriores pueden repetirse.
            </p>
            <select
              id="politica_repeticion"
              name="politica_repeticion"
              value={config.politica_repeticion}
              onChange={manejarCambio}
              className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 block text-sm text-gray-900"
            >
              <option value="ultimos_3">
                Últimos 3 simulacros (recomendado)
              </option>
              <option value="sin_repeticion">Ninguna repetición</option>
              <option value="relajada">Repetición relajada</option>
            </select>
          </div>

          <div>
            <span className="block text-sm font-medium text-gray-700 mb-2">
              Distribución de dificultad
            </span>
            <p className="text-sm text-gray-500 mb-2">
              Porcentajes para la selección de preguntas por dificultad en cada
              simulacro. Deben sumar aproximadamente 100.
            </p>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="distribucion_baja"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Baja
                </label>
                <input
                  id="distribucion_baja"
                  type="number"
                  name="distribucion_baja"
                  value={config.distribucion_dificultad.baja}
                  onChange={manejarCambio}
                  min="0"
                  max="100"
                  step="1"
                  className="w-full rounded-md border-gray-300 shadow-sm py-1 px-2 text-center text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="distribucion_media"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Media
                </label>
                <input
                  id="distribucion_media"
                  type="number"
                  name="distribucion_media"
                  value={config.distribucion_dificultad.media}
                  onChange={manejarCambio}
                  min="0"
                  max="100"
                  step="1"
                  className="w-full rounded-md border-gray-300 shadow-sm py-1 px-2 text-center text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="distribucion_alta"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Alta
                </label>
                <input
                  id="distribucion_alta"
                  type="number"
                  name="distribucion_alta"
                  value={config.distribucion_dificultad.alta}
                  onChange={manejarCambio}
                  min="0"
                  max="100"
                  step="1"
                  className="w-full rounded-md border-gray-300 shadow-sm py-1 px-2 text-center text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <p className="mt-2 text-xs text-gray-500">
              <strong>Suma actual:</strong> {sumaDistribucion} / 100
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push('/panel')}
              className="flex-1 py-3 px-4 rounded-md font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex-1 py-3 px-4 rounded-md font-medium text-white bg-purple-600 hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {guardando ? 'Guardando…' : 'Guardar configuración'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
