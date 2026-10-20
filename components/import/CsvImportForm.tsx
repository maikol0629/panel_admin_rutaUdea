/**
 * Componente CsvImportForm para el panel administrativo.
 *
 * Permite al admin subir un archivo CSV de preguntas, muestra una vista
 * previa con validación por fila y lo envía al backend (`/api/import/csv`).
 * Las preguntas válidas se insertan con estado "pendiente".
 */

import { useCallback, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useAdminUser } from '@/hooks/useAdminUser';

interface OpcionCSV {
  valor: string;
  letra: 'A' | 'B' | 'C' | 'D';
}

interface FilaPreview {
  id: string;
  componente: string;
  subtema: string;
  dificultad: string;
  pregunta: string;
  opciones: OpcionCSV[];
  respuestaCorrecta: string;
  explicacion: string;
  errores: string[];
  esValida: boolean;
}

interface EstadisticasImport {
  total: number;
  validas: number;
  invalidas: number;
  insertadas: number;
}

const ESTADISTICAS_VACIAS: EstadisticasImport = {
  total: 0,
  validas: 0,
  invalidas: 0,
  insertadas: 0,
};

const ENCABEZADOS_OBLIGATORIOS = [
  'id',
  'componente',
  'subtema',
  'dificultad',
  'pregunta',
  'opcion_a',
  'opcion_b',
  'opcion_c',
  'opcion_d',
  'respuesta_correcta',
  'explicacion',
  'tiene_contexto_compartido',
  'descripcion_contexto',
];

const COMPONENTES_VALIDOS = [
  'RL01', 'RL02', 'RL03', 'RL04', 'RL05', 'RL06', 'RL07', 'RL08',
  'RL09', 'RL10', 'RL11', 'RL12', 'RL13', 'RL14', 'RL15',
  'CL01', 'CL02', 'CL03', 'CL04', 'CL05', 'CL06', 'CL07',
  'CL08', 'CL09', 'CL10', 'CL11', 'CL12', 'CL13', 'CL14',
];

const DIFICULTADES_VALIDAS = ['baja', 'media', 'alta'];
const RESPUESTAS_VALIDAS = ['A', 'B', 'C', 'D'];

export default function CsvImportForm() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<FilaPreview[]>([]);
  const [estadisticas, setEstadisticas] =
    useState<EstadisticasImport>(ESTADISTICAS_VACIAS);
  const [mostrarError, setMostrarError] = useState<string | null>(null);
  const [esImportando, setEsImportando] = useState(false);
  const { rol, idToken } = useAdminUser();

  const procesarCSV = useCallback(async (file: File) => {
    setEsImportando(false);
    setMostrarError(null);
    setPreview([]);
    setEstadisticas(ESTADISTICAS_VACIAS);

    try {
      const texto = await file.text();
      const lineas = texto.split('\n').filter((l) => l.trim().length > 0);

      if (lineas.length < 2) {
        setMostrarError('El archivo parece vacío o solo tiene encabezados.');
        return;
      }

      const primera = lineas[0];
      if (!primera) {
        setMostrarError('El archivo parece vacío.');
        return;
      }
      const encabezado = primera.split(',').map((h) => h.trim());

      const faltantes = ENCABEZADOS_OBLIGATORIOS.filter(
        (h) => !encabezado.includes(h),
      );

      if (faltantes.length > 0) {
        setMostrarError(
          `Encabezados faltantes: ${faltantes.join(', ')}. ` +
            `Esperados: ${ENCABEZADOS_OBLIGATORIOS.join(', ')}`,
        );
        return;
      }

      const filasValidadas: FilaPreview[] = [];
      let validas = 0;
      let invalidas = 0;

      for (let i = 1; i < lineas.length; i++) {
        const linea = lineas[i];
        if (!linea) continue;
        const valores = linea.split(',').map((v) => v.trim());
        const fila: Record<string, string> = {};

        for (let j = 0; j < encabezado.length; j++) {
          const clave = encabezado[j];
          if (clave) fila[clave] = valores[j] ?? '';
        }

        const errores: string[] = [];
        const id = (fila['id'] ?? '').trim();
        const componente = (fila['componente'] ?? '').trim();
        const dificultad = (fila['dificultad'] ?? '').trim().toLowerCase();
        const respuesta = (fila['respuesta_correcta'] ?? '').trim().toUpperCase();
        const pregunta = (fila['pregunta'] ?? '').trim();
        const explicacion = (fila['explicacion'] ?? '').trim();

        if (!id) errores.push('ID vacío');
        if (!COMPONENTES_VALIDOS.includes(componente)) {
          errores.push(`Componente inválido: ${componente || '—'}`);
        }
        if (!DIFICULTADES_VALIDAS.includes(dificultad)) {
          errores.push(`Dificultad inválida: ${fila['dificultad'] ?? '—'}`);
        }
        if (!RESPUESTAS_VALIDAS.includes(respuesta)) {
          errores.push(
            `Respuesta correcta inválida: ${fila['respuesta_correcta'] ?? '—'}`,
          );
        }

        const opcionesVacias = (['A', 'B', 'C', 'D'] as const).filter(
          (opt) => !(fila[`opcion_${opt.toLowerCase()}`] ?? '').trim(),
        );
        if (opcionesVacias.length > 0) {
          errores.push(`Opciones vacías: ${opcionesVacias.join(', ')}`);
        }
        if (!pregunta) errores.push('Pregunta vacía');
        if (!explicacion) errores.push('Explicación vacía');

        const opciones: OpcionCSV[] = (['A', 'B', 'C', 'D'] as const).map(
          (letra) => ({
            letra,
            valor: (fila[`opcion_${letra.toLowerCase()}`] ?? '').trim(),
          }),
        );

        if (errores.length > 0) {
          invalidas++;
          filasValidadas.push({
            id: id || `fila-${i}`,
            componente,
            subtema: (fila['subtema'] ?? '').trim(),
            dificultad: (fila['dificultad'] ?? '').trim(),
            pregunta,
            opciones,
            respuestaCorrecta: respuesta,
            explicacion,
            errores,
            esValida: false,
          });
        } else {
          validas++;
          filasValidadas.push({
            id,
            componente,
            subtema: (fila['subtema'] ?? '').trim(),
            dificultad,
            pregunta,
            opciones,
            respuestaCorrecta: respuesta,
            explicacion,
            errores: [],
            esValida: true,
          });
        }
      }

      setPreview(filasValidadas);
      setEstadisticas({ total: lineas.length - 1, validas, invalidas, insertadas: 0 });
    } catch (err) {
      setMostrarError(
        `Error al procesar archivo: ${err instanceof Error ? err.message : 'desconocido'}`,
      );
    }
  }, []);

  const manejarCambioArchivo = (e: ChangeEvent<HTMLInputElement>) => {
    const archivoSeleccionado = e.target.files?.[0];
    if (!archivoSeleccionado) {
      setArchivo(null);
      setPreview([]);
      setEstadisticas(ESTADISTICAS_VACIAS);
      return;
    }

    if (!archivoSeleccionado.name.endsWith('.csv')) {
      setMostrarError('El archivo debe tener extensión .csv');
      setPreview([]);
      return;
    }

    setArchivo(archivoSeleccionado);
    void procesarCSV(archivoSeleccionado);
  };

  const reiniciar = () => {
    setArchivo(null);
    setPreview([]);
    setEstadisticas(ESTADISTICAS_VACIAS);
    setMostrarError(null);
  };

  const enviarAlBackend = useCallback(async () => {
    if (preview.length === 0 || !archivo) return;
    if (!idToken) {
      setMostrarError('Sesión no válida. Vuelva a iniciar sesión.');
      return;
    }

    setEsImportando(true);
    setMostrarError(null);

    try {
      const formData = new FormData();
      formData.append('file', archivo);

      const response = await fetch('/api/import/csv', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });

      const resultado = (await response.json()) as {
        success?: boolean;
        error?: string;
        resultado?: {
          preguntasInsertadas: number;
          preguntasValidas: number;
          preguntasInvalidas: number;
        };
      };

      if (resultado.success && resultado.resultado) {
        setEstadisticas((prev) => ({
          ...prev,
          insertadas: resultado.resultado?.preguntasInsertadas ?? 0,
        }));
        setMostrarError(null);
        window.alert(
          `Importación completada: ${resultado.resultado.preguntasInsertadas} preguntas insertadas ` +
            `con ${resultado.resultado.preguntasValidas} válidas y ` +
            `${resultado.resultado.preguntasInvalidas} inválidas (estado: pendiente).`,
        );
        reiniciar();
      } else {
        setMostrarError(resultado.error ?? 'Error desconocido en el backend');
      }
    } catch (err) {
      setMostrarError(
        `Error de conexión: ${err instanceof Error ? err.message : 'desconocido'}`,
      );
    } finally {
      setEsImportando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, archivo, idToken]);

  return (
    <div className="py-2">
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Importar Preguntas desde CSV
        </h2>
        <p className="text-sm text-gray-500 break-all">
          Formato esperado: {ENCABEZADOS_OBLIGATORIOS.join(',')}
        </p>
        {rol !== null && rol !== 'admin' && (
          <p className="mt-2 text-sm text-red-600">
            Acceso solo para administradores.
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl p-6 mb-6 shadow-sm">
        <h3 className="text-lg font-medium text-gray-500 mb-4">
          Seleccionar archivo CSV
        </h3>

        <label className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-500 cursor-pointer transition-colors block">
          <input
            type="file"
            accept=".csv"
            onChange={manejarCambioArchivo}
            className="hidden"
          />
          <p className="text-gray-400">
            {archivo ? archivo.name : 'Haga clic o arrastre un archivo CSV aquí'}
          </p>
          <p className="text-xs text-gray-500">
            Formato: 13 columnas obligatorias (ver descripción arriba)
          </p>
        </label>

        {preview.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-500 mb-2">
              Vista previa ({preview.length} filas)
            </h4>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-600 uppercase">
                    <th className="p-2">ID</th>
                    <th className="p-2">Componente</th>
                    <th className="p-2">Subtema</th>
                    <th className="p-2">Dificultad</th>
                    <th className="p-2">Pregunta (80 chars)</th>
                    <th className="p-2">Resp.</th>
                    <th className="p-2">Errores</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((fila, idx) => (
                    <tr
                      key={`${fila.id}-${idx}`}
                      className={fila.esValida ? 'bg-white' : 'bg-red-100'}
                    >
                      <td className="p-1 text-sm font-mono text-gray-600">
                        {fila.id || '-'}
                      </td>
                      <td className="p-1 text-sm text-gray-500">{fila.componente}</td>
                      <td className="p-1 text-sm text-gray-500">{fila.subtema}</td>
                      <td className="p-1 text-sm">
                        <span
                          className={
                            fila.esValida ? 'text-green-600' : 'text-red-500'
                          }
                        >
                          {fila.dificultad}
                        </span>
                      </td>
                      <td
                        className="p-1 text-xs text-gray-500 truncate max-w-xs"
                        title={fila.pregunta}
                      >
                        {fila.pregunta.substring(0, 80)}
                        {fila.pregunta.length > 80 ? '…' : ''}
                      </td>
                      <td className="p-1 text-sm">
                        <span
                          className={
                            fila.esValida
                              ? 'text-green-600 font-medium'
                              : 'text-red-500'
                          }
                        >
                          {fila.respuestaCorrecta}
                        </span>
                      </td>
                      <td className="p-1 text-xs text-gray-500">
                        {fila.errores.slice(0, 2).join(', ')}
                        {fila.errores.length > 2
                          ? ` +${fila.errores.length - 2} más`
                          : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200 text-xs text-blue-700">
              <strong>{estadisticas.validas} válidas</strong> |{' '}
              <strong>{estadisticas.invalidas} inválidas</strong> |{' '}
              <strong>{estadisticas.total} total</strong>
            </div>
          </div>
        )}

        {mostrarError && (
          <div className="mt-3 p-3 bg-red-50 rounded border border-red-200 text-red-700 text-sm">
            {mostrarError}
          </div>
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-gray-200">
        {estadisticas.validas > 0 && (
          <button
            onClick={enviarAlBackend}
            disabled={esImportando}
            className="w-full py-3 px-4 rounded-md font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {esImportando
              ? 'Importando…'
              : 'Importar a Firestore (estado: pendiente)'}
          </button>
        )}

        {estadisticas.total > 0 && (
          <button
            onClick={reiniciar}
            className="w-full py-3 px-4 rounded-md font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors mt-3"
          >
            Reiniciar
          </button>
        )}
      </div>

      {esImportando && (
        <div className="mt-4 p-4 bg-gray-100 rounded border border-gray-300 text-center text-sm">
          <p>
            Enviando lote de {estadisticas.validas} preguntas al backend…
          </p>
          <span className="text-gray-500">
            Esto puede tardar unos segundos según el tamaño del lote.
          </span>
        </div>
      )}
    </div>
  );
}

export type { FilaPreview, EstadisticasImport, OpcionCSV };
