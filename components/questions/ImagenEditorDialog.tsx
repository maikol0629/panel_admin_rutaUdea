/**
 * ImagenEditorDialog — Molécula: diálogo modal que envuelve
 * ImagenEditorCanvas para editar una imagen tipo Photoshop antes de guardarla.
 */

import { useEffect, useState } from 'react';
import ImagenEditorCanvas from './ImagenEditorCanvas';

interface ImagenEditorDialogProps {
  /** Si el diálogo está abierto. */
  abierto: boolean;
  /** Valor actual de la imagen (data URL o null). */
  valorActual: string | null;
  /** Callback al cerrar sin guardar. */
  onCerrar: () => void;
  /** Callback al confirmar con la imagen editada. Recibe el data URL o null. */
  onConfirmar: (valor: string | null) => void;
  /** Índice de la imagen que se está editando (para identificarla). */
  indiceImagen?: number;
}

export default function ImagenEditorDialog({
  abierto,
  valorActual,
  onCerrar,
  onConfirmar,
  indiceImagen,
}: ImagenEditorDialogProps) {
  const [editorValor, setEditorValor] = useState<string | null>(valorActual);

  // Sincronizar editorValor cuando valorActual cambia (al abrir con una imagen nueva)
  useEffect(() => {
    setEditorValor(valorActual);
  }, [valorActual, abierto]);

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-imagen-titulo"
      tabIndex={-1}
    >
      {/* Fondo */}
      <button
        type="button"
        onClick={onCerrar}
        className="fixed inset-0 z-0 bg-black/60 backdrop-blur-sm"
        aria-label="Cerrar editor de imagen"
      />
      {/* Panel */}
      <div className="relative z-10 w-full max-w-3xl max-h-[95vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 m-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <h2 id="editor-imagen-titulo" className="text-sm font-semibold text-gray-900">
            Editar imagen
            {indiceImagen !== undefined && ` #${indiceImagen + 1}`}
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-md text-gray-500 hover:text-gray-900 transition-colors"
            aria-label="Cerrar editor"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 min-h-[400px]">
          <ImagenEditorCanvas
            valorInicial={editorValor}
            onConfirmar={(valor) => {
              setEditorValor(valor);
              onConfirmar(valor);
            }}
            onCancelar={onCerrar}
            etiquetaConfirmar="Aplicar cambios a la imagen"
          />
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 shrink-0 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCerrar}
            className="px-4 py-2 rounded-lg font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirmar(editorValor)}
            className="px-4 py-2 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            Guardar imagen
          </button>
        </div>
      </div>
    </div>
  );
}
