/**
 * Formulario de edición de preguntas (contrato v2).
 *
 * Prioriza el contenido que el revisor debe editar (enunciado, imágenes,
 * opciones, respuesta, explicación) y oculta los metadatos técnicos
 * (ID, versión, schema, componente, etc.) detrás de un panel desplegable,
 * ya que rara vez se necesitan durante la revisión de reportes.
 */

import { useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import ImagenPreview from './ImagenPreview';
import { AREAS, type ImagenRef, type PreguntaEditable } from './types';

interface Props {
  initial: PreguntaEditable;
  saving: boolean;
  serverError: string | null;
  soloLectura?: boolean;
  onSubmit: (datos: PreguntaEditable) => void;
  onCancel: () => void;
}

const inputClase =
  'w-full rounded-md border-gray-300 shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500';

function Etiqueta({ texto, htmlFor }: { texto: string; htmlFor: string }): ReactNode {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
      {texto}
    </label>
  );
}

function Ayuda({ children }: { children: ReactNode }): ReactNode {
  return <p className="text-xs text-gray-400 mt-1">{children}</p>;
}

export default function QuestionForm({
  initial,
  saving,
  serverError,
  soloLectura = false,
  onSubmit,
  onCancel,
}: Props) {
  const [datos, setDatos] = useState<PreguntaEditable>(initial);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [mostrarMetadatos, setMostrarMetadatos] = useState(false);

  const set = <K extends keyof PreguntaEditable>(
    campo: K,
    valor: PreguntaEditable[K],
  ) => {
    setDatos((prev) => ({ ...prev, [campo]: valor }));
  };

  const setOpcion = (letra: 'A' | 'B' | 'C' | 'D', valor: string) => {
    setDatos((prev) => ({
      ...prev,
      opciones: { ...prev.opciones, [letra]: valor },
    }));
  };

  const onCampoTexto = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    set(name as keyof PreguntaEditable, value as never);
  };

  const setImagen = (indice: number, cambios: Partial<ImagenRef>) => {
    setDatos((prev) => ({
      ...prev,
      imagenes: prev.imagenes.map((img, i) =>
        i === indice ? { ...img, ...cambios } : img,
      ),
    }));
  };

  const agregarImagen = () => {
    setDatos((prev) => ({
      ...prev,
      imagenes: [
        ...prev.imagenes,
        {
          url: null,
          rol: 'contexto',
          orden: prev.imagenes.filter((i) => i.rol === 'contexto').length + 1,
          alt: null,
          path_origen: null,
        },
      ],
    }));
  };

  const quitarImagen = (indice: number) => {
    setDatos((prev) => ({
      ...prev,
      imagenes: prev.imagenes.filter((_, i) => i !== indice),
    }));
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (soloLectura) return;
    setErrorLocal(null);

    if (!datos.pregunta.trim()) {
      setErrorLocal('El enunciado no puede estar vacío.');
      return;
    }
    if (!datos.subtema.trim()) {
      setErrorLocal('El subtema es obligatorio (taxonomía RL01–RL18 / CL01–CL14).');
      return;
    }
    const deshabilitando =
      datos.estado === 'deshabilitado' && initial.estado !== 'deshabilitado';
    if (deshabilitando && !datos.motivo?.trim()) {
      setErrorLocal('Para deshabilitar, indique el motivo (queda en las notas).');
      return;
    }
    const publicando =
      datos.estado === 'aprobado' || datos.estado === 'aprobado_con_imagen';
    if (publicando) {
      const letras = ['A', 'B', 'C', 'D'] as const;
      const vacias = letras.filter((l) => !datos.opciones[l].trim());
      if (vacias.length > 0) {
        setErrorLocal(`Para publicar, complete las opciones: ${vacias.join(', ')}.`);
        return;
      }
      if (!datos.respuesta_correcta) {
        setErrorLocal('Para publicar, defina la respuesta correcta.');
        return;
      }
      if (!datos.verificada) {
        setErrorLocal('Para publicar, marque la pregunta como verificada.');
        return;
      }
      const requiereImagen =
        datos.requiere_imagen || datos.estado === 'aprobado_con_imagen';
      const tieneImagen =
        datos.imagenes.some((i) => i.url && i.url.trim()) || Boolean(datos.imagen_url);
      if (requiereImagen && !tieneImagen) {
        setErrorLocal('La pregunta requiere imagen y no tiene ninguna URL publicada.');
        return;
      }
    }

    onSubmit(datos);
  };

  return (
    <form
      onSubmit={enviar}
      className="bg-white rounded-xl shadow-sm p-6 sm:p-8 space-y-6"
    >
      {(errorLocal || serverError) && (
        <div className="p-3 bg-red-50 rounded border border-red-200 text-red-700 text-sm">
          {errorLocal ?? serverError}
        </div>
      )}
      {soloLectura && (
        <div className="p-3 bg-amber-50 rounded border border-amber-200 text-amber-800 text-sm">
          Vista de solo lectura (banco legacy). Para editar use `questions_v2`.
        </div>
      )}

      {/* Encabezado: solo lo esencial */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <span
          className={`text-xs px-2 py-0.5 rounded font-medium ${
            datos.estado === 'aprobado'
              ? 'bg-green-100 text-green-700'
              : datos.estado === 'aprobado_con_imagen'
                ? 'bg-emerald-100 text-emerald-700'
                : datos.estado === 'pendiente'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-gray-100 text-gray-700'
          }`}
        >
          {datos.estado}
        </span>
        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
          {datos.dificultad || '—'}
        </span>
        {datos.opciones_en_imagen && (
          <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">
            Opciones en imagen
          </span>
        )}
        {datos.verificada && (
          <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700">
            Verificada
          </span>
        )}
        <button
          type="button"
          onClick={() => setMostrarMetadatos((prev) => !prev)}
          className="ml-auto text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1 underline-offset-2 hover:underline"
        >
          {mostrarMetadatos ? 'Ocultar' : 'Mostrar'} técnica
        </button>
      </div>

      {/* Contexto compartido */}
      {datos.contexto && (
        <div className="p-3 bg-slate-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap border border-gray-100">
          {datos.contexto}
        </div>
      )}

      {/* Enunciado principal */}
      <div>
        <Etiqueta texto="Enunciado" htmlFor="f-pregunta" />
        <textarea
          id="f-pregunta"
          name="pregunta"
          value={datos.pregunta}
          onChange={onCampoTexto}
          rows={5}
          className={inputClase}
          disabled={soloLectura}
        />
      </div>

      {/* Imágenes reales (no URLs de texto) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Etiqueta texto="Imágenes (D-05)" htmlFor="" />
          {!soloLectura && (
            <button
              type="button"
              onClick={agregarImagen}
              className="text-sm px-3 py-1.5 rounded-md border border-blue-600 text-blue-700 hover:bg-blue-50"
            >
              + Agregar imagen
            </button>
          )}
        </div>
        {datos.imagenes.length === 0 ? (
          <p className="text-sm text-gray-500">Sin imágenes asociadas.</p>
        ) : (
          <div className="space-y-4">
            {datos.imagenes.map((imagen, indice) => (
              <div
                key={`${imagen.rol}-${indice}`}
                className="rounded-xl border border-gray-200 bg-white p-4"
              >
                <ImagenPreview
                  imagen={imagen}
                  indice={indice}
                  soloLectura={soloLectura}
                  onUrlChange={(_indiceRecibido, url) =>
                    setImagen(indice, { url: url || null })
                  }
                  onRemove={(idx) => quitarImagen(idx)}
                />
                {!soloLectura && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">
                        Rol
                      </label>
                      <select
                        value={imagen.rol}
                        onChange={(e) =>
                          setImagen(indice, {
                            rol: e.target.value === 'contexto' ? 'contexto' : 'pregunta',
                          })
                        }
                        className={inputClase}
                        disabled={soloLectura}
                      >
                        <option value="contexto">contexto</option>
                        <option value="pregunta">pregunta</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">
                        Orden
                      </label>
                      <input
                        type="number"
                        value={imagen.orden}
                        onChange={(e) =>
                          setImagen(indice, {
                            orden: Number(e.target.value) || 1,
                          })
                        }
                        className={inputClase}
                        disabled={soloLectura}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase">
                        Texto alternativo
                      </label>
                      <input
                        value={imagen.alt ?? ''}
                        onChange={(e) =>
                          setImagen(indice, {
                            alt: e.target.value.trim() || null,
                          })
                        }
                        className={inputClase}
                        disabled={soloLectura}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div>
          <Etiqueta texto="imagen_url (compatibilidad)" htmlFor="f-imagenurl" />
          <input
            id="f-imagenurl"
            value={datos.imagen_url ?? ''}
            onChange={(e) => set('imagen_url', e.target.value.trim() || null)}
            className={inputClase}
            disabled={soloLectura}
          />
          <Ayuda>
            Se mantiene para clientes antiguos; la app v2 prioriza `imagenes[]`.
          </Ayuda>
        </div>
      </div>

      {/* Opciones */}
      <div>
        <Etiqueta texto="Opciones" htmlFor="" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(['A', 'B', 'C', 'D'] as const).map((letra) => (
            <div key={letra}>
              <Etiqueta texto={`Opción ${letra}`} htmlFor={`f-op-${letra}`} />
              <input
                id={`f-op-${letra}`}
                value={datos.opciones[letra]}
                onChange={(e) => setOpcion(letra, e.target.value)}
                className={inputClase}
                disabled={soloLectura}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Etiqueta texto="Respuesta correcta" htmlFor="f-resp" />
          <select
            id="f-resp"
            value={datos.respuesta_correcta ?? ''}
            onChange={(e) => set('respuesta_correcta', e.target.value || null)}
            className={inputClase}
            disabled={soloLectura}
          >
            <option value="">— Sin definir —</option>
            {(['A', 'B', 'C', 'D'] as const).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-6 pb-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={datos.opciones_en_imagen}
              onChange={(e) => set('opciones_en_imagen', e.target.checked)}
              disabled={soloLectura}
            />
            Opciones en la imagen (D-06)
          </label>
        </div>
        <div className="flex items-end gap-6 pb-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={datos.requiere_imagen}
              onChange={(e) => set('requiere_imagen', e.target.checked)}
              disabled={soloLectura}
            />
            Requiere imagen
          </label>
        </div>
      </div>

      {/* Explicación */}
      <div>
        <Etiqueta texto="Explicación" htmlFor="f-expl" />
        <textarea
          id="f-expl"
          name="explicacion"
          value={datos.explicacion}
          onChange={onCampoTexto}
          rows={3}
          className={inputClase}
          disabled={soloLectura}
        />
      </div>

      {/* Campos de área / componente / subtema / taxonomía */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Etiqueta texto="Área" htmlFor="f-area" />
          <select
            id="f-area"
            value={datos.area}
            onChange={(e) => set('area', e.target.value)}
            className={inputClase}
            disabled={soloLectura}
          >
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a === 'razonamiento_logico'
                  ? 'Razonamiento Lógico'
                  : 'Competencia Lectora'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Etiqueta texto="Componente" htmlFor="f-componente" />
          <input
            id="f-componente"
            name="componente"
            value={datos.componente}
            onChange={onCampoTexto}
            className={inputClase}
            disabled={soloLectura}
          />
        </div>
        <div>
          <Etiqueta texto="Subtema (taxonomía)" htmlFor="f-subtema" />
          <input
            id="f-subtema"
            name="subtema"
            value={datos.subtema}
            onChange={onCampoTexto}
            className={inputClase}
            disabled={soloLectura}
            placeholder="Ej: RL02 Porcentajes"
          />
        </div>
      </div>

      {/* Metadatos técnicos — ocultos por defecto */}
      {mostrarMetadatos && (
        <details className="border border-gray-200 rounded-lg overflow-hidden">
          <summary className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer list-none font-medium text-sm text-gray-600 hover:bg-gray-100">
            <span>Metadatos técnicos (infraestructura)</span>
            <span className="text-xs text-gray-500">Ocultar</span>
          </summary>
          <div className="p-4 space-y-3 text-sm grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">ID</p>
              <p className="text-gray-700 font-mono">{datos.id}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">
                Versión banco
              </p>
              <p className="text-gray-700 font-mono">{datos.bank_version}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Schema</p>
              <p className="text-gray-700 font-mono">{datos.schema_version}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Tarea</p>
              <p className="text-gray-700">{datos.tarea ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Número</p>
              <p className="text-gray-700">{datos.numero ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Tipo</p>
              <p className="text-gray-700">{datos.tipo ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">
                Confianza modelo
              </p>
              <p className="text-gray-700">{datos.confianza_modelo ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Verificada</p>
              <p className="text-gray-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={datos.verificada}
                    onChange={(e) => set('verificada', e.target.checked)}
                    disabled={soloLectura}
                  />
                  {datos.verificada ? 'Sí' : 'No'}
                </label>
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-gray-400 uppercase">Texto base</p>
              <p className="text-gray-700 whitespace-pre-wrap">
                {datos.texto_base ?? '—'}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-gray-400 uppercase">
                IDs de contexto
              </p>
              <p className="text-gray-700 font-mono whitespace-pre-wrap">
                {(datos.contexto_ids ?? []).join(', ') || '—'}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-gray-400 uppercase">Fuente</p>
              <p className="text-gray-700">{datos.fuente ?? '—'}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-gray-400 uppercase">Tipo fuente</p>
              <p className="text-gray-700">{datos.tipo_fuente ?? '—'}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-gray-400 uppercase">
                Revisado por
              </p>
              <p className="text-gray-700">{datos.revisado_por ?? '—'}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-gray-400 uppercase">
                Fecha revisión
              </p>
              <p className="text-gray-700">{datos.fecha_revision ?? '—'}</p>
            </div>
          </div>
        </details>
      )}

      {datos.estado === 'deshabilitado' && (
        <div>
          <Etiqueta
            texto={
              initial.estado === 'deshabilitado'
                ? 'Motivo de la deshabilitación'
                : 'Motivo de la deshabilitación (obligatorio)'
            }
            htmlFor="f-motivo"
          />
          <input
            id="f-motivo"
            value={datos.motivo ?? ''}
            onChange={(e) => set('motivo', e.target.value || null)}
            className={inputClase}
            placeholder="Ej: figura que ya no existe en el banco"
            disabled={soloLectura}
          />
          <Ayuda>
            Se agrega a `notas` con fecha y usuario del panel. Solo es obligatorio cuando
            la pregunta pasa a deshabilitada.
          </Ayuda>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 px-4 rounded-md font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
        >
          {soloLectura ? 'Volver' : 'Cancelar'}
        </button>
        <button
          type="submit"
          disabled={saving || soloLectura}
          className="flex-1 py-2 px-4 rounded-md font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
