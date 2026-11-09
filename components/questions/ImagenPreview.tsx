/**
 * ImagenPreview — Átomo/Molécula: muestra una imagen de pregunta/contexto de
 * forma responsiva y permite editarla (URL externa, subida de archivo o
 * editor tipo Photoshop vía Canvas).
 *
 * - Se adapta al ancho del contenedor y al tamaño de pantalla.
 * - Nunca muestra URLs como texto plano; solo la imagen (o un placeholder).
 * - Al hacer clic en "Editar" se abre un diálogo con el editor de Canvas
 *   (recorte, rotación, brillo, contraste, saturación, escala de grises).
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import type { ImagenRef } from './types';
import ImagenEditor from './ImagenEditor';

interface ImagenPreviewProps {
  imagen: ImagenRef;
  /** Índice de la imagen en el arreglo (para identificarla al editar). */
  indice: number;
  /** Máximo alto de la imagen en pantalla (Tailwind). */
  maxHeight?: string;
  /** Si es true, no permite editar ni quitar. */
  soloLectura?: boolean;
  /** Callback cuando cambia la URL de la imagen. */
  onUrlChange: (indice: number, url: string | null) => void;
  /** Callback para quitar la imagen. */
  onRemove: (indice: number) => void;
}

export default function ImagenPreview({
  imagen,
  indice,
  maxHeight = 'max-h-96',
  soloLectura = false,
  onUrlChange,
  onRemove,
}: ImagenPreviewProps) {
  const router = useRouter();

  const tieneUrl = Boolean(imagen.url && imagen.url.trim());

  const manejarCambioUrlExterna = (valor: string | null) => {
    onUrlChange(indice, valor);
  };

  const manejarCambioCanvas = (valor: string | null) => {
    onUrlChange(indice, valor);
  };

  const abrirEditor = () => {
    if (soloLectura || !imagen.url) return;
    const clave = `imagen-editor-${Date.now()}-${indice}`;
    sessionStorage.setItem(
      clave,
      JSON.stringify({
        valor: imagen.url,
        returnTo: router.asPath,
        indice,
      }),
    );
    void router.push({
      pathname: '/panel/imagenes/editar',
      query: { clave },
    });
  };

  useEffect(() => {
    if (!router.isReady || !router.query.editorResultado) return;
    const resultado = Array.isArray(router.query.editorResultado)
      ? router.query.editorResultado[0]
      : router.query.editorResultado;
    const indiceResultado = Array.isArray(router.query.indiceImagen)
      ? router.query.indiceImagen[0]
      : router.query.indiceImagen;
    if (!resultado || Number(indiceResultado) !== indice) return;
    const valor = sessionStorage.getItem(resultado);
    if (valor !== null) {
      sessionStorage.removeItem(resultado);
      onUrlChange(indice, valor || null);
      void router.replace(router.asPath.split('?')[0] ?? router.asPath, undefined, {
        shallow: true,
      });
    }
  }, [router, indice, onUrlChange]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col sm:flex-row gap-4 items-start">
      {/* Vista previa de la imagen (o placeholder) */}
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center">
        {tieneUrl && imagen.url ? (
          <button
            type="button"
            onClick={abrirEditor}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                abrirEditor();
              }
            }}
            className="flex flex-col items-center justify-center"
          >
            <img
              src={imagen.url}
              alt={imagen.alt ?? `Imagen de ${imagen.rol}`}
              className={`max-w-full ${maxHeight} object-contain rounded-lg border border-gray-200 bg-gray-50 shadow-sm`}
              loading="lazy"
              decoding="async"
            />
          </button>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 w-full rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50 text-gray-400">
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
            <p className="text-sm font-medium">Sin imagen publicada</p>
            <p className="text-xs text-gray-500 mt-1">
              Agrega una URL o edita una imagen
            </p>
          </div>
        )}
        {!soloLectura && (
          <button
            type="button"
            onClick={abrirEditor}
            className="mt-2 text-[10px] text-blue-600 hover:text-blue-800 underline underline-offset-2 flex items-center gap-1"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7m-11.5 2c1.621 2.189 4.01 3.56 6.77 3.56s5.149-1.371 6.77-3.56m-5.56 4.88c-1.038-1.4 2.25-2.88 4.79-2.88 2.54 0 5.823 1.48 6.77 2.88m-7.12 0c-1.038-1.4 2.25-2.88 4.79-2.88 2.54 0 5.823 1.48 6.77 2.88m-7.12 0c-1.038-1.4 2.25-2.88 4.79-2.88 2.54 0 5.823 1.48 6.77 2.88"
              />
            </svg>
            Editar imagen
          </button>
        )}
      </div>

      {/* Controles de edición */}
      {!soloLectura && (
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Input de URL externa */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">
              URL externa
            </label>
            <input
              type="text"
              value={imagen.url ?? ''}
              onChange={(e) => manejarCambioUrlExterna(e.target.value.trim() || null)}
              placeholder="https://…"
              className="w-full rounded-md border-gray-300 shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            {imagen.alt && (
              <p className="text-xs text-gray-500 mt-1">Alt: {imagen.alt}</p>
            )}
          </div>

          {/* Editor de subida de archivo */}
          <ImagenEditor
            valor={imagen.url ?? null}
            onCambio={(valor) => manejarCambioCanvas(valor)}
            desactivado={soloLectura}
          />
        </div>
      )}

      {!soloLectura && onRemove && (
        <button
          type="button"
          onClick={() => onRemove(indice)}
          className="w-8 h-8 rounded-full border border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center justify-center"
          title="Quitar imagen"
          aria-label="Quitar imagen"
        >
          ×
        </button>
      )}
    </div>
  );
}
