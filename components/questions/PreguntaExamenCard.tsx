/**
 * PreguntaExamenCard — Átomo/Molécula: presenta una pregunta como se le
 * muestra a un alumno en un examen, priorizando el contenido sobre la
 * infraestructura.
 *
 * Muestra: enunciado, imágenes (reales), opciones con respuesta correcta
 * resaltada y explicación. Toda la información técnica (ID, versión, schema,
 * estado, etc.) se oculta por defecto y se revela solo si el revisor la
 * necesita.
 */

import type { PreguntaV2 } from './types';

interface PreguntaExamenCardProps {
  pregunta: PreguntaV2;
  /** Si se muestran los metadatos técnicos debajo del contenido. */
  mostrarMetadatos?: boolean;
  /** Callback opcional para editar la pregunta. */
  onEditar?: () => void;
}

export default function PreguntaExamenCard({
  pregunta,
  mostrarMetadatos = false,
  onEditar,
}: PreguntaExamenCardProps) {
  const imagenes: {
    url: string | null;
    rol: string;
    orden: number;
    alt: string | null;
  }[] = pregunta.imagenes ?? [];
  const esCorrecta = (letra: string) => pregunta.respuesta_correcta === letra;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-6">
      {/* Encabezado compacto: solo lo esencial para el revisor */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <span
          className={`text-xs px-2 py-0.5 rounded font-medium ${
            pregunta.estado === 'aprobado'
              ? 'bg-green-100 text-green-700'
              : pregunta.estado === 'aprobado_con_imagen'
                ? 'bg-emerald-100 text-emerald-700'
                : pregunta.estado === 'pendiente'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-gray-100 text-gray-700'
          }`}
        >
          {pregunta.estado}
        </span>
        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
          {pregunta.dificultad || '—'}
        </span>
        {pregunta.opciones_en_imagen && (
          <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">
            Opciones en imagen
          </span>
        )}
        {onEditar && (
          <button
            type="button"
            onClick={onEditar}
            className="ml-auto text-sm text-blue-600 hover:underline font-medium"
          >
            Editar pregunta →
          </button>
        )}
      </div>

      {/* Contexto compartido (si aplica) */}
      {pregunta.contexto && (
        <div className="p-3 bg-slate-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap border border-gray-100">
          {pregunta.contexto}
        </div>
      )}

      {/* Enunciado principal — como lo ve el alumno */}
      <h1 className="text-lg sm:text-xl font-semibold text-gray-900 whitespace-pre-wrap leading-relaxed">
        {pregunta.pregunta}
      </h1>

      {/* Imágenes de la pregunta (reales, no URLs de texto) */}
      {imagenes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {imagenes.map((img, indice) => (
            <div
              key={`${img.rol}-${indice}`}
              className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex flex-col items-center"
            >
              {img.url ? (
                <img
                  src={img.url}
                  alt={img.alt ?? `Imagen de ${img.rol}`}
                  className="max-w-full max-h-64 object-contain rounded-md border border-gray-100 bg-white shadow-sm"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="w-full h-32 flex flex-col items-center justify-center rounded-md border-2 border-dashed border-gray-200 bg-gray-50/50 text-gray-400">
                  <p className="text-[10px] font-medium">Sin imagen publicada</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Opciones — como en el examen, respuesta correcta resaltada */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(['A', 'B', 'C', 'D'] as const).map((letra) => {
          const correcta = esCorrecta(letra);
          return (
            <div
              key={letra}
              className={`p-3 rounded-lg border text-sm leading-relaxed ${
                correcta
                  ? 'border-green-500 bg-green-50 font-medium'
                  : 'border-gray-200 text-gray-800'
              }`}
            >
              <span className="font-mono font-bold mr-2">{letra}.</span>
              {pregunta.opciones[letra]}
              {correcta && (
                <span className="ml-2 text-xs text-green-700 flex items-center gap-1">
                  ✓ Correcta
                </span>
              )}
            </div>
          );
        })}
      </div>

      {!pregunta.respuesta_correcta && (
        <p className="mt-2 text-sm text-red-600">
          ⚠ Sin respuesta definida — no se puede aprobar hasta definirla.
        </p>
      )}

      {/* Explicación — colapsable por defecto para no saturar */}
      {pregunta.explicacion && pregunta.explicacion.trim() && (
        <details className="border border-gray-200 rounded-lg overflow-hidden">
          <summary className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer list-none font-medium text-sm text-gray-700 hover:bg-gray-100">
            <span>Explicación</span>
            <span className="text-xs text-gray-500">Mostrar</span>
          </summary>
          <div className="p-4 text-sm text-gray-700 whitespace-pre-wrap border-t border-gray-100 bg-white">
            {pregunta.explicacion}
          </div>
        </details>
      )}

      {/* Metadatos técnicos — ocultos por defecto, solo si el revisor los necesita */}
      {mostrarMetadatos && (
        <details className="border border-gray-200 rounded-lg overflow-hidden">
          <summary className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer list-none font-medium text-sm text-gray-600 hover:bg-gray-100">
            <span>Información técnica (infraestructura)</span>
            <span className="text-xs text-gray-500">Mostrar</span>
          </summary>
          <div className="p-4 space-y-3 text-sm grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">ID</p>
              <p className="text-gray-700 font-mono">{pregunta.id}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Área</p>
              <p className="text-gray-700">{pregunta.area}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Subtema</p>
              <p className="text-gray-700">{pregunta.subtema}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">
                Versión banco
              </p>
              <p className="text-gray-700 font-mono">{pregunta.bank_version}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Schema</p>
              <p className="text-gray-700 font-mono">{pregunta.schema_version}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Componente</p>
              <p className="text-gray-700">{pregunta.componente}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Tarea</p>
              <p className="text-gray-700">{pregunta.tarea ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Tipo</p>
              <p className="text-gray-700">{pregunta.tipo ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Verificada</p>
              <p className="text-gray-700">{pregunta.verificada ? 'Sí' : 'No'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">
                Revisado por
              </p>
              <p className="text-gray-700">{pregunta.revisado_por ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">
                Fecha revisión
              </p>
              <p className="text-gray-700">{pregunta.fecha_revision ?? '—'}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-gray-400 uppercase">Notas</p>
              <p className="text-gray-700 whitespace-pre-wrap">{pregunta.notas ?? '—'}</p>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
