/**
 * Tarjeta de un evento del historial de preguntas.
 *
 * Muestra autor, fecha, acción, origen, vínculo al reporte y el diff de los
 * campos afectados. Las imágenes se presentan como metadatos: el historial
 * nunca guarda el contenido completo de una imagen `data:` URL.
 */

import Link from 'next/link';
import {
  ETIQUETAS_ACCION,
  ETIQUETAS_CAMPO,
  ETIQUETAS_ORIGEN,
  type CambioCampo,
  type EventoHistorial,
  type ImagenHistorial,
  type RefImagenHistorial,
} from '@/lib/historial';

const COLOR_ACCION: Record<string, string> = {
  creacion: 'bg-blue-100 text-blue-800 border-blue-200',
  edicion: 'bg-amber-100 text-amber-800 border-amber-200',
  revision: 'bg-green-100 text-green-800 border-green-200',
  deshabilitacion: 'bg-red-100 text-red-800 border-red-200',
  importacion: 'bg-purple-100 text-purple-800 border-purple-200',
};

const COLOR_ORIGEN: Record<string, string> = {
  panel: 'bg-slate-100 text-slate-700 border-slate-200',
  reporte: 'bg-rose-100 text-rose-800 border-rose-200',
  importacion: 'bg-violet-100 text-violet-800 border-violet-200',
};

function fechaLegible(fechaMs: number): string {
  if (!Number.isFinite(fechaMs) || fechaMs <= 0) return 'Fecha desconocida';
  try {
    return new Date(fechaMs).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(fechaMs);
  }
}

function formatearBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return 'tamaño desconocido';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function textoValor(valor: unknown): string {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'number') return String(valor);
  if (typeof valor === 'string') return valor || '—';
  return JSON.stringify(valor, null, 2);
}

function RefImagenValor({ valor }: { valor: unknown }) {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    return <ValorTexto valor={valor} />;
  }
  const ref = valor as RefImagenHistorial;
  return (
    <div className="rounded border border-slate-200 bg-white p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-700">{ref.tipo}</span>
        {ref.bytes !== null && (
          <span className="text-slate-500">{formatearBytes(ref.bytes)}</span>
        )}
      </div>
      {ref.url ? (
        <a
          href={ref.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block break-all text-blue-600 hover:underline"
        >
          {ref.url}
        </a>
      ) : ref.tipo === 'data_url' ? (
        <p className="mt-1 text-slate-500">
          Imagen embebida: el contenido no se guarda en el historial.
        </p>
      ) : (
        <p className="mt-1 text-slate-500">Sin URL.</p>
      )}
    </div>
  );
}

function ImagenesValor({ valor }: { valor: unknown }) {
  if (!Array.isArray(valor)) return <ValorTexto valor={valor} />;
  if (valor.length === 0) {
    return <p className="text-xs text-slate-500">Sin imágenes.</p>;
  }
  return (
    <div className="space-y-2">
      {valor.map((item, indice) => {
        const imagen = item as ImagenHistorial;
        return (
          <div
            key={`${imagen.rol}-${imagen.orden}-${indice}`}
            className="rounded border border-slate-200 bg-white p-2 text-xs"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-700">
                #{imagen.orden} · {imagen.rol}
              </span>
              <span className="text-slate-500">{imagen.tipo}</span>
              {imagen.bytes !== null && (
                <span className="text-slate-500">{formatearBytes(imagen.bytes)}</span>
              )}
            </div>
            {imagen.alt && <p className="mt-1 text-slate-600">Alt: {imagen.alt}</p>}
            {imagen.sha256 && (
              <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
                sha256: {imagen.sha256.slice(0, 20)}
                {imagen.sha256.length > 20 ? '…' : ''}
              </p>
            )}
            {imagen.url ? (
              <a
                href={imagen.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all text-blue-600 hover:underline"
              >
                {imagen.url}
              </a>
            ) : imagen.tipo === 'data_url' ? (
              <p className="mt-1 text-slate-500">
                Imagen embebida: el contenido no se guarda en el historial.
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ValorTexto({ valor }: { valor: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-white p-2 text-xs text-slate-700">
      {textoValor(valor)}
    </pre>
  );
}

function OpcionesDiff({ antes, despues }: CambioCampo) {
  const a = (typeof antes === 'object' && antes !== null ? antes : {}) as Record<
    string,
    unknown
  >;
  const d = (typeof despues === 'object' && despues !== null ? despues : {}) as Record<
    string,
    unknown
  >;
  const letras = ['A', 'B', 'C', 'D'];
  const filas = letras
    .map((letra) => ({
      letra,
      antes: String(a[letra] ?? ''),
      despues: String(d[letra] ?? ''),
    }))
    .filter((fila) => fila.antes !== fila.despues);

  if (filas.length === 0) {
    return (
      <p className="text-xs text-slate-500">Sin cambios visibles en las opciones.</p>
    );
  }

  return (
    <div className="space-y-1 text-xs">
      {filas.map((fila) => (
        <div
          key={fila.letra}
          className="grid gap-1 rounded border border-slate-200 bg-white p-2 sm:grid-cols-[2rem_1fr_1fr] sm:items-center"
        >
          <span className="font-mono font-semibold text-slate-600">{fila.letra}</span>
          <span className="break-words text-red-700 line-through">
            {fila.antes || '—'}
          </span>
          <span className="break-words text-green-700">{fila.despues || '—'}</span>
        </div>
      ))}
    </div>
  );
}

function CambioValor({ campo, valor }: { campo: string; valor: unknown }) {
  if (campo === 'imagenes') return <ImagenesValor valor={valor} />;
  if (campo === 'imagen_url') return <RefImagenValor valor={valor} />;
  if (campo === 'contexto_ids') {
    return (
      <p className="break-words text-xs text-slate-700">
        {Array.isArray(valor) && valor.length > 0 ? valor.join(', ') : '—'}
      </p>
    );
  }
  if (campo === 'estado') {
    return (
      <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
        {String(valor ?? '—')}
      </span>
    );
  }
  return <ValorTexto valor={valor} />;
}

function SnapshotDetalle({ snapshot }: { snapshot: Record<string, unknown> }) {
  const filas: { campo: string; valor: unknown }[] = [
    { campo: 'pregunta', valor: snapshot['pregunta'] },
    { campo: 'contexto', valor: snapshot['contexto'] },
    { campo: 'texto_base', valor: snapshot['texto_base'] },
    { campo: 'opciones', valor: snapshot['opciones'] },
    { campo: 'respuesta_correcta', valor: snapshot['respuesta_correcta'] },
    { campo: 'explicacion', valor: snapshot['explicacion'] },
    { campo: 'imagenes', valor: snapshot['imagenes'] },
    { campo: 'imagen_url', valor: snapshot['imagen_url'] },
    { campo: 'estado', valor: snapshot['estado'] },
  ].filter((fila) => {
    const valor = fila.valor;
    if (valor === null || valor === undefined || valor === '') return false;
    if (Array.isArray(valor) && valor.length === 0) return false;
    // En creación/importación `imagen_url` siempre existe como referencia
    // sanitizada; no mostrarla cuando la pregunta no tiene imagen.
    if (
      fila.campo === 'imagen_url' &&
      typeof valor === 'object' &&
      valor !== null &&
      (valor as RefImagenHistorial).tipo === 'sin_url'
    ) {
      return false;
    }
    return true;
  });

  if (filas.length === 0) return null;

  return (
    <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
        Contenido registrado
      </summary>
      <div className="mt-3 space-y-2">
        {filas.map((fila) => (
          <div key={fila.campo}>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {ETIQUETAS_CAMPO[fila.campo] ?? fila.campo}
            </div>
            {fila.campo === 'opciones' ? (
              <OpcionesDiff antes={{}} despues={fila.valor} />
            ) : (
              <CambioValor campo={fila.campo} valor={fila.valor} />
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

interface Props {
  evento: EventoHistorial;
  /** Reporte que se está revisando; resalta los eventos vinculados. */
  destacarReporte?: string | null;
}

export default function EventoHistorialCard({ evento, destacarReporte }: Props) {
  const cambios = Object.entries(evento.cambios);
  const resaltado = Boolean(destacarReporte && evento.reporteId === destacarReporte);

  return (
    <article
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        resaltado ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                COLOR_ACCION[evento.accion] ?? 'bg-slate-100 text-slate-700'
              }`}
            >
              {ETIQUETAS_ACCION[evento.accion] ?? evento.accion}
            </span>
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                COLOR_ORIGEN[evento.origen] ?? 'bg-slate-100 text-slate-700'
              }`}
            >
              {ETIQUETAS_ORIGEN[evento.origen] ?? evento.origen}
            </span>
            {evento.reporteId && (
              <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                Reporte {evento.reporteId}
              </span>
            )}
          </div>
          <p className="mt-2 break-words text-sm font-medium text-slate-800">
            {evento.resumen || 'Cambio registrado.'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {fechaLegible(evento.fechaMs)} · {evento.actorNombre || evento.actorUid}
            {evento.actorRol ? ` (${evento.actorRol})` : ''} · {evento.preguntaId}
          </p>
        </div>
        <Link
          href={`/panel/preguntas/${encodeURIComponent(evento.preguntaId)}#historial`}
          className="shrink-0 text-xs text-blue-600 hover:underline"
        >
          Ver pregunta
        </Link>
      </header>

      {cambios.length > 0 && (
        <div className="mt-4 space-y-3">
          {cambios.map(([campo, cambio]) => (
            <div
              key={campo}
              className="rounded-lg border border-slate-100 bg-slate-50/70 p-3"
            >
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {ETIQUETAS_CAMPO[campo] ?? campo}
              </div>
              {campo === 'opciones' ? (
                <OpcionesDiff antes={cambio.antes} despues={cambio.despues} />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-red-500">
                      Antes
                    </div>
                    <CambioValor campo={campo} valor={cambio.antes} />
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-green-600">
                      Después
                    </div>
                    <CambioValor campo={campo} valor={cambio.despues} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {evento.snapshot && <SnapshotDetalle snapshot={evento.snapshot} />}
    </article>
  );
}
