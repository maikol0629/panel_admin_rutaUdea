/**
 * Formulario de importación JSONL (contrato v2).
 *
 * Sube un archivo `.jsonl` a `/api/import/jsonl` para `questions_v2` o
 * `contexts_v2`. Por defecto todo entra como `pendiente` (D-08); el
 * administrador puede conservar el estado del archivo explícitamente.
 */

import { useCallback, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useAdminUser } from '@/hooks/useAdminUser';

interface ErrorFila {
  linea: number;
  id: string;
  errores: string[];
}

interface ResultadoImportacion {
  tipo?: string;
  coleccion?: string;
  archivo?: string;
  totalLineas?: number;
  validas?: number;
  invalidas?: number;
  guardadas?: number;
  errores?: ErrorFila[];
}

interface RespuestaImportacion {
  success?: boolean;
  mensaje?: string;
  resultado?: ResultadoImportacion;
  error?: string;
}

export default function JsonlImportForm() {
  const { idToken } = useAdminUser();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [tipo, setTipo] = useState<'preguntas' | 'contextos'>('preguntas');
  const [respetarEstado, setRespetarEstado] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const onArchivo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setArchivo(file);
    setResultado(null);
    setError(null);
    setAviso(null);
  };

  const importar = useCallback(async () => {
    if (!archivo || !idToken) return;
    setSubiendo(true);
    setError(null);
    setAviso(null);
    setResultado(null);
    try {
      const form = new FormData();
      form.append('file', archivo);
      form.append('respetar_estado', respetarEstado ? 'true' : 'false');
      const res = await fetch(`/api/import/jsonl?tipo=${tipo}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: form,
      });
      const data = (await res.json()) as RespuestaImportacion;
      if (!res.ok) {
        throw new Error(data.error ?? 'No se pudo importar el archivo');
      }
      setResultado(data.resultado ?? null);
      setAviso(data.mensaje ?? 'Importación completada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setSubiendo(false);
    }
  }, [archivo, idToken, tipo, respetarEstado]);

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
      <div>
        <h2 className="text-lg font-medium text-gray-900">
          Importar desde JSONL (recomendado)
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Acepta el formato canónico del ETL (`questions_v2.jsonl` o
          `contexts_v2.jsonl`). Valida cada línea y reporta las inválidas con su
          número y motivo.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tipo de archivo
          </label>
          <select
            value={tipo}
            onChange={(e) =>
              setTipo(e.target.value === 'contextos' ? 'contextos' : 'preguntas')
            }
            className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 text-sm"
            disabled={subiendo}
          >
            <option value="preguntas">Preguntas → questions_v2</option>
            <option value="contextos">Contextos → contexts_v2</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Archivo
          </label>
          <input
            type="file"
            accept=".jsonl,application/jsonl,application/x-ndjson,text/plain"
            onChange={onArchivo}
            className="w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            disabled={subiendo}
          />
          {archivo && (
            <p className="text-xs text-gray-500 mt-1 font-mono">
              {archivo.name} · {(archivo.size / 1024).toFixed(1)} KB
            </p>
          )}
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={respetarEstado}
          onChange={(e) => setRespetarEstado(e.target.checked)}
          className="h-4 w-4 mt-0.5"
          disabled={subiendo || tipo === 'contextos'}
        />
        <span>
          Conservar `estado` y `verificada` del archivo.
          <span className="block text-xs text-gray-400">
            Por defecto todo entra como <code>pendiente</code> y sin verificar
            (D-08). Solo use esta opción para restaurar un lote ya revisado.
          </span>
        </span>
      </label>

      {error && (
        <div className="p-3 bg-red-50 rounded border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}
      {aviso && (
        <div className="p-3 bg-green-50 rounded border border-green-200 text-green-700 text-sm">
          {aviso}
        </div>
      )}

      {resultado && (
        <div className="rounded-lg border border-gray-200 p-4 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="bg-slate-50 rounded p-2">
              <p className="text-xs text-gray-500">Líneas</p>
              <p className="font-semibold">{resultado.totalLineas ?? 0}</p>
            </div>
            <div className="bg-green-50 rounded p-2">
              <p className="text-xs text-gray-500">Válidas</p>
              <p className="font-semibold text-green-700">{resultado.validas ?? 0}</p>
            </div>
            <div className="bg-red-50 rounded p-2">
              <p className="text-xs text-gray-500">Inválidas</p>
              <p className="font-semibold text-red-700">{resultado.invalidas ?? 0}</p>
            </div>
            <div className="bg-blue-50 rounded p-2">
              <p className="text-xs text-gray-500">Guardadas</p>
              <p className="font-semibold text-blue-700">{resultado.guardadas ?? 0}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 font-mono">{resultado.coleccion}</p>
          {resultado.errores && resultado.errores.length > 0 && (
            <details open>
              <summary className="text-sm text-red-700 cursor-pointer">
                Detalle de filas inválidas ({resultado.errores.length})
              </summary>
              <ul className="mt-2 max-h-64 overflow-auto space-y-1 text-xs">
                {resultado.errores.slice(0, 100).map((fila, i) => (
                  <li key={`${fila.linea}-${i}`} className="font-mono text-gray-600">
                    línea {fila.linea} · {fila.id}: {fila.errores.join('; ')}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <button
        onClick={() => void importar()}
        disabled={!archivo || !idToken || subiendo}
        className="py-2 px-5 rounded-md font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
      >
        {subiendo ? 'Importando…' : 'Importar archivo'}
      </button>
    </div>
  );
}
