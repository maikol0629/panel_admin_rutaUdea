/**
 * ImagenEditor — Átomo: permite seleccionar una imagen del equipo,
 * previsualizarla y convertirla a base64 (data URL) para almacenarla.
 *
 * - Filtra solo archivos de imagen.
 * - Límite de 5 MB por archivo.
 * - Muestra la imagen real (no la URL de texto).
 * - Devuelve el data URL listo para guardar en Firestore.
 */

import { useCallback, useState } from 'react';

const MAX_TAMANIO_MB = 5;
const MAX_BYTES = MAX_TAMANIO_MB * 1024 * 1024;

interface ImagenEditorProps {
  /** Valor actual (data URL o string vacío si no hay). */
  valor: string | null;
  /** Callback cuando el usuario elige una imagen. Recibe el data URL o null. */
  onCambio: (valor: string | null) => void;
  /** Altura máxima de la previsualización. */
  maxAlto?: string;
  /** Si está desactivado. */
  desactivado?: boolean;
}

export default function ImagenEditor({
  valor,
  onCambio,
  maxAlto = 'max-h-64',
  desactivado = false,
}: ImagenEditorProps) {
  const [error, setError] = useState<string | null>(null);

  const convertirArchivo = useCallback(
    (archivo: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(lector.result as string);
        lector.onerror = () => reject(new Error('No se pudo leer el archivo'));
        lector.readAsDataURL(archivo);
      }),
    [],
  );

  const manejarSeleccion = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) {
      setError('Selecciona un archivo de imagen válido.');
      return;
    }
    if (archivo.size > MAX_BYTES) {
      setError(`La imagen supera los ${MAX_TAMANIO_MB} MB.`);
      return;
    }
    try {
      const dataUrl = await convertirArchivo(archivo);
      onCambio(dataUrl);
      e.target.value = '';
    } catch {
      setError('No se pudo procesar la imagen.');
    }
  };

  const limpiar = () => {
    setError(null);
    onCambio(null);
  };

  const tieneValor = Boolean(valor && valor.trim());

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col sm:flex-row gap-4 items-start">
      {/* Previsualización */}
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center">
        {tieneValor && valor ? (
          <img
            src={valor}
            alt="Previsualización"
            className={`max-w-full ${maxAlto} object-contain rounded-lg border border-gray-200 bg-white shadow-sm`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-32 w-full rounded-lg border-2 border-dashed border-gray-300 bg-white/50 text-gray-400">
            <svg
              className="w-10 h-10 mb-2 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm font-medium">Sin imagen seleccionada</p>
          </div>
        )}
      </div>

      {/* Controles */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">
          Imagen del equipo
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={manejarSeleccion}
          disabled={desactivado}
          className="block w-full text-sm text-gray-700
            file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100
            cursor-pointer"
        />
        {tieneValor && (
          <button
            type="button"
            onClick={limpiar}
            disabled={desactivado}
            className="text-xs text-red-600 hover:text-red-800 underline underline-offset-2"
          >
            Quitar imagen
          </button>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <p className="text-[10px] text-gray-400">
          Máx. {MAX_TAMANIO_MB} MB · JPG, PNG, WebP
        </p>
      </div>
    </div>
  );
}
