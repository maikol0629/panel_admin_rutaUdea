/**
 * Formulario completo de edición de preguntas (contrato v2).
 *
 * Incluye:
 * - Campos por área: `contexto` (RL y grupos CL) y `texto_base` (CL).
 * - Opciones como objeto `{A,B,C,D}` y aviso D-06 (`opciones_en_imagen`).
 * - Editor de imágenes con rol/orden/alt (D-05).
 * - Metadatos de revisión y trazabilidad (versión, tarea, confianza).
 *
 * No borra campos desconocidos: el formulario solo envía las claves que el
 * usuario ve; la API hace `merge` sobre el documento original.
 */

import { useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import {
  AREAS,
  DIFICULTADES,
  ESTADOS,
  esRazonamiento,
  type EstadoPregunta,
  type ImagenRef,
  type PreguntaEditable,
} from './types';

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
const inputLectura = `${inputClase} bg-gray-100`;

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
  const [contextoIdsTexto, setContextoIdsTexto] = useState(
    (initial.contexto_ids ?? []).join(', '),
  );

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
    // El motivo solo es obligatorio al deshabilitar desde otro estado; editar
    // otros campos de una pregunta ya deshabilitada no debe exigirlo de nuevo.
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

    const contextoIds = contextoIdsTexto
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    onSubmit({ ...datos, contexto_ids: contextoIds });
  };

  const esRL = esRazonamiento(datos.area);

  return (
    <form onSubmit={enviar} className="bg-white rounded-xl shadow-sm p-6 space-y-5">
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Etiqueta texto="ID" htmlFor="f-id" />
          <input id="f-id" value={datos.id} disabled className={inputLectura} />
        </div>
        <div>
          <Etiqueta texto="Versión del banco" htmlFor="f-version" />
          <input
            id="f-version"
            value={datos.bank_version}
            disabled
            className={`${inputLectura} font-mono`}
          />
        </div>
        <div>
          <Etiqueta texto="Schema" htmlFor="f-schema" />
          <input
            id="f-schema"
            value={datos.schema_version}
            disabled
            className={inputLectura}
          />
        </div>
      </div>

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
          <Etiqueta texto="Estado" htmlFor="f-estado" />
          <select
            id="f-estado"
            value={datos.estado}
            onChange={(e) => set('estado', e.target.value as EstadoPregunta)}
            className={inputClase}
            disabled={soloLectura}
          >
            {ESTADOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Ayuda>
            Publicar exige taxonomía, 4 opciones, respuesta, verificación e imágenes con
            URL cuando aplique.
          </Ayuda>
        </div>
        <div>
          <Etiqueta texto="Verificada" htmlFor="f-verificada" />
          <label className="flex items-center gap-2 text-sm text-gray-700 py-2">
            <input
              id="f-verificada"
              type="checkbox"
              checked={datos.verificada}
              onChange={(e) => set('verificada', e.target.checked)}
              disabled={soloLectura}
            />
            Revisada por una persona
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <div>
          <Etiqueta texto="Dificultad" htmlFor="f-dificultad" />
          <select
            id="f-dificultad"
            value={datos.dificultad}
            onChange={(e) => set('dificultad', e.target.value)}
            className={inputClase}
            disabled={soloLectura}
          >
            {DIFICULTADES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
          <Etiqueta texto="Tarea" htmlFor="f-tarea" />
          <input
            id="f-tarea"
            name="tarea"
            value={datos.tarea ?? ''}
            onChange={onCampoTexto}
            className={inputClase}
            disabled={soloLectura}
            placeholder="T2"
          />
        </div>
        <div>
          <Etiqueta texto="Número" htmlFor="f-numero" />
          <input
            id="f-numero"
            type="number"
            value={datos.numero ?? ''}
            onChange={(e) =>
              set('numero', e.target.value === '' ? null : Number(e.target.value))
            }
            className={inputClase}
            disabled={soloLectura}
          />
        </div>
        <div>
          <Etiqueta texto="Tipo" htmlFor="f-tipo" />
          <input
            id="f-tipo"
            name="tipo"
            value={datos.tipo ?? ''}
            onChange={onCampoTexto}
            className={inputClase}
            disabled={soloLectura}
            placeholder="individual | grupo"
          />
        </div>
        <div>
          <Etiqueta texto="Confianza del modelo" htmlFor="f-confianza" />
          <input
            id="f-confianza"
            name="confianza_modelo"
            value={datos.confianza_modelo ?? ''}
            onChange={onCampoTexto}
            className={inputClase}
            disabled={soloLectura}
            placeholder="alta | media | baja"
          />
        </div>
      </div>

      <div>
        <Etiqueta texto="Enunciado" htmlFor="f-pregunta" />
        <textarea
          id="f-pregunta"
          name="pregunta"
          value={datos.pregunta}
          onChange={onCampoTexto}
          rows={4}
          className={inputClase}
          disabled={soloLectura}
        />
      </div>

      <div>
        <Etiqueta texto="Contexto compartido (texto)" htmlFor="f-ctx" />
        <textarea
          id="f-ctx"
          name="contexto"
          value={datos.contexto ?? ''}
          onChange={onCampoTexto}
          rows={3}
          className={inputClase}
          disabled={soloLectura}
        />
      </div>

      {!esRL && (
        <div>
          <Etiqueta texto="Texto base (lectura)" htmlFor="f-texto" />
          <textarea
            id="f-texto"
            name="texto_base"
            value={datos.texto_base ?? ''}
            onChange={onCampoTexto}
            rows={4}
            className={inputClase}
            disabled={soloLectura}
          />
        </div>
      )}

      <div>
        <Etiqueta texto="IDs de contexto (separados por coma)" htmlFor="f-ctxids" />
        <input
          id="f-ctxids"
          value={contextoIdsTexto}
          onChange={(e) => setContextoIdsTexto(e.target.value)}
          className={`${inputClase} font-mono`}
          placeholder="T2-C01, T2-C02"
          disabled={soloLectura}
        />
        <Ayuda>Deben existir en `contexts_v2` para poder publicar el lote.</Ayuda>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Etiqueta texto="Fuente" htmlFor="f-fuente" />
          <input
            id="f-fuente"
            name="fuente"
            value={datos.fuente ?? ''}
            onChange={onCampoTexto}
            className={inputClase}
            disabled={soloLectura}
          />
        </div>
        <div>
          <Etiqueta texto="Tipo de fuente" htmlFor="f-tipofuente" />
          <input
            id="f-tipofuente"
            name="tipo_fuente"
            value={datos.tipo_fuente ?? ''}
            onChange={onCampoTexto}
            className={inputClase}
            disabled={soloLectura}
          />
        </div>
      </div>

      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">
            Imágenes (D-05: contexto y pregunta)
          </h3>
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
          <div className="space-y-3">
            {datos.imagenes.map((imagen, indice) => (
              <div
                key={`${imagen.rol}-${indice}`}
                className="rounded-lg border border-gray-200 p-3 grid grid-cols-1 sm:grid-cols-12 gap-3"
              >
                <div className="sm:col-span-5">
                  <Etiqueta texto="URL" htmlFor={`f-img-url-${indice}`} />
                  <input
                    id={`f-img-url-${indice}`}
                    value={imagen.url ?? ''}
                    onChange={(e) =>
                      setImagen(indice, { url: e.target.value.trim() || null })
                    }
                    className={inputClase}
                    placeholder="https://…"
                    disabled={soloLectura}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Etiqueta texto="Rol" htmlFor={`f-img-rol-${indice}`} />
                  <select
                    id={`f-img-rol-${indice}`}
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
                <div className="sm:col-span-1">
                  <Etiqueta texto="Orden" htmlFor={`f-img-orden-${indice}`} />
                  <input
                    id={`f-img-orden-${indice}`}
                    type="number"
                    value={imagen.orden}
                    onChange={(e) =>
                      setImagen(indice, { orden: Number(e.target.value) || 1 })
                    }
                    className={inputClase}
                    disabled={soloLectura}
                  />
                </div>
                <div className="sm:col-span-3">
                  <Etiqueta texto="Texto alternativo" htmlFor={`f-img-alt-${indice}`} />
                  <input
                    id={`f-img-alt-${indice}`}
                    value={imagen.alt ?? ''}
                    onChange={(e) =>
                      setImagen(indice, { alt: e.target.value.trim() || null })
                    }
                    className={inputClase}
                    disabled={soloLectura}
                  />
                </div>
                <div className="sm:col-span-1 flex items-end">
                  {!soloLectura && (
                    <button
                      type="button"
                      onClick={() => quitarImagen(indice)}
                      className="w-full py-2 rounded-md border border-red-300 text-red-700 text-sm hover:bg-red-50"
                      title="Quitar imagen"
                    >
                      ×
                    </button>
                  )}
                </div>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Etiqueta texto="Revisado por" htmlFor="f-revisor" />
          <input
            id="f-revisor"
            value={datos.revisado_por ?? ''}
            onChange={(e) => set('revisado_por', e.target.value.trim() || null)}
            className={inputClase}
            disabled={soloLectura}
          />
        </div>
        <div>
          <Etiqueta texto="Fecha de revisión" htmlFor="f-fecharev" />
          <input
            id="f-fecharev"
            value={datos.fecha_revision ?? ''}
            onChange={(e) => set('fecha_revision', e.target.value.trim() || null)}
            className={inputClase}
            disabled={soloLectura}
          />
        </div>
        <div>
          <Etiqueta texto="Notas" htmlFor="f-notas" />
          <input
            id="f-notas"
            name="notas"
            value={datos.notas ?? ''}
            onChange={onCampoTexto}
            className={inputClase}
            disabled={soloLectura}
          />
        </div>
      </div>

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
