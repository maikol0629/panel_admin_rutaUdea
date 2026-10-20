/**
 * /api/settings
 *
 * GET — Obtener los parámetros de configuración del simulacro.
 * PUT — Actualizar parámetros (solo campos enviados, con validación).
 *
 * Colección `settings`, documento singleton `config`.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  adminErrorStatus,
  COLECCION_SETTINGS,
  getAdminDb,
  requireAdmin,
} from '@/lib/firebase-admin';

const DOC_CONFIG = 'config';

type PoliticaRepeticion = 'ultimos_3' | 'sin_repeticion' | 'relajada';

interface DistribucionDificultad {
  baja: number;
  media: number;
  alta: number;
}

interface SettingsDoc {
  tiempo_simulacro_minutos: number;
  inactividad_max_minutos: number;
  politica_repeticion: PoliticaRepeticion;
  distribucion_dificultad: DistribucionDificultad;
  creado_por?: string;
  fecha_ultima_actualizacion?: string;
}

const CONFIG_DEFAULTS: SettingsDoc = {
  tiempo_simulacro_minutos: 120,
  inactividad_max_minutos: 30,
  politica_repeticion: 'ultimos_3',
  distribucion_dificultad: { baja: 25, media: 50, alta: 25 },
};

function esPolitica(v: unknown): v is PoliticaRepeticion {
  return v === 'ultimos_3' || v === 'sin_repeticion' || v === 'relajada';
}

function esDistribucion(v: unknown): v is DistribucionDificultad {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d['baja'] === 'number' &&
    typeof d['media'] === 'number' &&
    typeof d['alta'] === 'number'
  );
}

async function leerConfig(): Promise<SettingsDoc> {
  const docRef = getAdminDb().collection(COLECCION_SETTINGS).doc(DOC_CONFIG);
  const snap = await docRef.get();
  if (!snap.exists) {
    const inicial: SettingsDoc = {
      ...CONFIG_DEFAULTS,
      fecha_ultima_actualizacion: new Date().toISOString(),
      creado_por: 'system',
    };
    await docRef.set(inicial);
    return inicial;
  }
  const data = snap.data() as Partial<SettingsDoc> | undefined;
  return {
    tiempo_simulacro_minutos:
      data?.tiempo_simulacro_minutos ?? CONFIG_DEFAULTS.tiempo_simulacro_minutos,
    inactividad_max_minutos:
      data?.inactividad_max_minutos ?? CONFIG_DEFAULTS.inactividad_max_minutos,
    politica_repeticion:
      data?.politica_repeticion && esPolitica(data.politica_repeticion)
        ? data.politica_repeticion
        : CONFIG_DEFAULTS.politica_repeticion,
    distribucion_dificultad:
      data?.distribucion_dificultad && esDistribucion(data.distribucion_dificultad)
        ? data.distribucion_dificultad
        : CONFIG_DEFAULTS.distribucion_dificultad,
    creado_por: data?.creado_por,
    fecha_ultima_actualizacion: data?.fecha_ultima_actualizacion,
  };
}

async function handleGet(_req: NextApiRequest, res: NextApiResponse) {
  const config = await leerConfig();
  return res.status(200).json({ success: true, config });
}

async function handlePut(req: NextApiRequest, res: NextApiResponse) {
  const body =
    typeof req.body === 'string'
      ? (JSON.parse(req.body) as Record<string, unknown>)
      : (req.body as Record<string, unknown>);

  const {
    tiempo_simulacro_minutos,
    inactividad_max_minutos,
    politica_repeticion,
    distribucion_dificultad,
  } = body;

  if (
    tiempo_simulacro_minutos !== undefined &&
    (typeof tiempo_simulacro_minutos !== 'number' ||
      tiempo_simulacro_minutos < 1 ||
      tiempo_simulacro_minutos > 525600)
  ) {
    return res.status(400).json({
      error: 'El tiempo simulacro debe estar entre 1 y 525600 minutos',
    });
  }

  if (
    inactividad_max_minutos !== undefined &&
    (typeof inactividad_max_minutos !== 'number' || inactividad_max_minutos < 0)
  ) {
    return res.status(400).json({
      error: 'El tiempo de inactividad no puede ser negativo',
    });
  }

  if (politica_repeticion !== undefined && !esPolitica(politica_repeticion)) {
    return res.status(400).json({
      error:
        'Política de repetición inválida. Use: ultimos_3, sin_repeticion o relajada',
    });
  }

  if (distribucion_dificultad !== undefined) {
    if (!esDistribucion(distribucion_dificultad)) {
      return res.status(400).json({
        error: 'La distribución debe tener baja, media y alta como números',
      });
    }
    const { baja, media, alta } = distribucion_dificultad;
    if (baja < 0 || media < 0 || alta < 0) {
      return res
        .status(400)
        .json({ error: 'Los porcentajes no pueden ser negativos' });
    }
    const suma = baja + media + alta;
    if (suma <= 0 || suma > 200) {
      return res.status(400).json({
        error: 'La distribución de dificultad debe sumar entre 1 y 200',
      });
    }
  }

  const actual = await leerConfig();
  const nueva: SettingsDoc = {
    tiempo_simulacro_minutos:
      typeof tiempo_simulacro_minutos === 'number'
        ? tiempo_simulacro_minutos
        : actual.tiempo_simulacro_minutos,
    inactividad_max_minutos:
      typeof inactividad_max_minutos === 'number'
        ? inactividad_max_minutos
        : actual.inactividad_max_minutos,
    politica_repeticion: esPolitica(politica_repeticion)
      ? politica_repeticion
      : actual.politica_repeticion,
    distribucion_dificultad: esDistribucion(distribucion_dificultad)
      ? distribucion_dificultad
      : actual.distribucion_dificultad,
  };

  await getAdminDb()
    .collection(COLECCION_SETTINGS)
    .doc(DOC_CONFIG)
    .set(
      { ...nueva, fecha_ultima_actualizacion: new Date().toISOString() },
      { merge: true },
    );

  return res.status(200).json({
    success: true,
    mensaje: 'Configuración actualizada correctamente',
    config: nueva,
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await requireAdmin(req);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error de autenticación';
    return res.status(adminErrorStatus(error)).json({ error: message });
  }

  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'PUT') return await handlePut(req, res);
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (error) {
    console.error('Error en /api/settings:', error);
    const message =
      error instanceof Error ? error.message : 'Error interno de configuración';
    return res.status(500).json({ error: message });
  }
}
