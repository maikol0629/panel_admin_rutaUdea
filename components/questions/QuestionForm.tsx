/**
 * Formulario completo de edición de preguntas.
 *
 * Campos condicionales por área (según el banco real):
 * - razonamiento_logico → competencia + contexto
 * - competencia_lectora → texto_base + tipo_texto
 */

import { useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import {
  AREAS,
  DIFICULTADES,
  ESTADOS,
  esRazonamiento,
  type EstadoPregunta,
  type PreguntaEditable,
} from './types';

interface Props {
  initial: PreguntaEditable;
  saving: boolean;
  serverError: string | null;
  onSubmit: (datos: PreguntaEditable) => void;
  onCancel: () => void;
}

const inputClase =
  'w-full rounded-md border-gray-300 shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500';

function Etiqueta({ texto, htmlFor }: { texto: string; htmlFor: string }): ReactNode {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-sm font-medium text-gray-700 mb-1"
    >
      {texto}
    </label>
  );
}

export default function QuestionForm({
  initial,
  saving,
  serverError,
  onSubmit,
  onCancel,
}: Props) {
  const [datos, setDatos] = useState<PreguntaEditable>(initial);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

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

  const onCampoTexto = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    set(name as keyof PreguntaEditable, value as never);
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setErrorLocal(null);
    if (!datos.pregunta.trim()) {
      setErrorLocal('El enunciado no puede estar vacío.');
      return;
    }
    if (datos.estado === 'aprobado') {
      const letras = ['A', 'B', 'C', 'D'] as const;
      const vacias = letras.filter((l) => !datos.opciones[l].trim());
      if (vacias.length > 0) {
        setErrorLocal(
          `Para aprobar, complete las opciones: ${vacias.join(', ')}.`,
        );
        return;
      }
      if (!datos.respuesta_correcta) {
        setErrorLocal('Para aprobar, defina la respuesta correcta.');
        return;
      }
    }
    onSubmit(datos);
  };

  const esRL = esRazonamiento(datos.area);

  return (
    <form
      onSubmit={enviar}
      className="bg-white rounded-xl shadow-sm p-6 space-y-5"
    >
      {(errorLocal || serverError) && (
        <div className="p-3 bg-red-50 rounded border border-red-200 text-red-700 text-sm">
          {errorLocal ?? serverError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Etiqueta texto="ID" htmlFor="f-id" />
          <input
            id="f-id"
            value={datos.id}
            disabled
            className={`${inputClase} bg-gray-100 font-mono`}
          />
        </div>
        <div>
          <Etiqueta texto="Área" htmlFor="f-area" />
          <select
            id="f-area"
            value={datos.area}
            onChange={(e) => set('area', e.target.value)}
            className={inputClase}
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
            value={datos.estado ?? 'pendiente'}
            onChange={(e) => set('estado', e.target.value as EstadoPregunta)}
            className={inputClase}
          >
            {ESTADOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Aprobar exige enunciado, 4 opciones y respuesta definida.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Etiqueta texto="Subtema" htmlFor="f-subtema" />
          <input
            id="f-subtema"
            name="subtema"
            value={datos.subtema}
            onChange={onCampoTexto}
            className={inputClase}
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
          >
            {DIFICULTADES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
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
        />
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
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Etiqueta texto="Respuesta correcta" htmlFor="f-resp" />
          <select
            id="f-resp"
            value={datos.respuesta_correcta ?? ''}
            onChange={(e) => set('respuesta_correcta', e.target.value || null)}
            className={inputClase}
          >
            <option value="">— Sin definir —</option>
            {(['A', 'B', 'C', 'D'] as const).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Etiqueta texto="Tipo de texto (solo lectura)" htmlFor="f-tipotexto" />
          <input
            id="f-tipotexto"
            name="tipo_texto"
            value={datos.tipo_texto ?? ''}
            onChange={onCampoTexto}
            className={inputClase}
            disabled={esRL}
            placeholder={esRL ? 'No aplica a razonamiento' : 'Ej: argumentativo'}
          />
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
        />
      </div>

      {esRL ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Etiqueta texto="Competencia" htmlFor="f-comp" />
            <input
              id="f-comp"
              name="competencia"
              value={datos.competencia ?? ''}
              onChange={onCampoTexto}
              className={inputClase}
            />
          </div>
          <div>
            <Etiqueta texto="Contexto" htmlFor="f-ctx" />
            <textarea
              id="f-ctx"
              name="contexto"
              value={datos.contexto ?? ''}
              onChange={onCampoTexto}
              rows={3}
              className={inputClase}
            />
          </div>
        </div>
      ) : (
        <div>
          <Etiqueta texto="Texto base (lectura)" htmlFor="f-texto" />
          <textarea
            id="f-texto"
            name="texto_base"
            value={datos.texto_base ?? ''}
            onChange={onCampoTexto}
            rows={4}
            className={inputClase}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Etiqueta texto="Fuente" htmlFor="f-fuente" />
          <input
            id="f-fuente"
            name="fuente"
            value={datos.fuente ?? ''}
            onChange={onCampoTexto}
            className={inputClase}
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
          />
        </div>
        <div className="flex items-end gap-6 pb-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={datos.es_original ?? false}
              onChange={(e) => set('es_original', e.target.checked)}
            />
            Original
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={datos.verificada ?? false}
              onChange={(e) => set('verificada', e.target.checked)}
            />
            Verificada
          </label>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 px-4 rounded-md font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2 px-4 rounded-md font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
