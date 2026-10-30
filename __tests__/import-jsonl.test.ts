/**
 * Tests del importador JSONL (`/api/import/jsonl`).
 *
 * Mockea Firebase Admin para verificar, sin Firestore real:
 * - toda pregunta entra como `pendiente` por defecto (D-08);
 * - `respetar_estado=true` conserva estado pero exige contrato completo;
 * - las filas inválidas se reportan con su línea y no se escriben;
 * - `tipo=contextos` escribe en `contexts_v2`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const setLote = vi.fn();
  const commit = vi.fn(async () => undefined);
  const doc = vi.fn(() => ({ set: vi.fn() }));
  const collection = vi.fn(() => ({ doc }));
  const batch = vi.fn(() => ({ set: setLote, commit }));
  return { setLote, commit, doc, collection, batch };
});

vi.mock('@/lib/firebase-admin', () => ({
  adminErrorStatus: () => 500,
  COLECCION_QUESTIONS: 'questions_v2',
  COLECCION_CONTEXTS: 'contexts_v2',
  getAdminDb: () => ({
    collection: mocks.collection,
    batch: mocks.batch,
  }),
  requireAdmin: async () => ({ uid: 'admin-1', rol: 'admin', nombre: 'Tester' }),
}));

import handler from '../pages/api/import/jsonl';

interface Respuesta {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function respuesta(): Respuesta {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

function request(
  contenido: string,
  opciones: {
    query?: Record<string, string>;
    filename?: string;
    respetar?: boolean;
  } = {},
) {
  const cuerpo = JSON.stringify({
    filename: opciones.filename ?? 'lote.jsonl',
    content: contenido,
    respetar_estado: opciones.respetar ?? false,
  });
  const iterador = (async function* () {
    yield Buffer.from(cuerpo, 'utf-8');
  })();
  return Object.assign(iterador, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    query: opciones.query ?? {},
    body: undefined,
  });
}

const base = {
  bank_version: 'udea-2026-10-v1',
  schema_version: 2,
  area: 'razonamiento_logico',
  componente: 'Razonamiento Lógico',
  subtema: 'RL02 Porcentajes',
  dificultad: 'media',
  pregunta: '¿Cuánto es el 10 % de 100?',
  opciones: { A: '10', B: '20', C: '30', D: '40' },
  respuesta_correcta: 'A',
  estado: 'aprobado',
  verificada: true,
  imagenes: [],
  requiere_imagen: false,
  opciones_en_imagen: false,
};

function jsonl(...filas: Record<string, unknown>[]): string {
  return filas.map((f) => JSON.stringify(f)).join('\n');
}

describe('POST /api/import/jsonl — preguntas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.commit.mockResolvedValue(undefined);
  });

  it('importa una pregunta completa como pendiente', async () => {
    const res = respuesta();
    await handler(request(jsonl({ ...base, id: 'T1-P01' })) as never, res as never);

    expect(mocks.batch).toHaveBeenCalled();
    const documento = mocks.setLote.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(documento['id']).toBe('T1-P01');
    expect(documento['estado']).toBe('pendiente');
    expect(documento['verificada']).toBe(false);
    expect(documento['opciones']).toEqual({ A: '10', B: '20', C: '30', D: '40' });

    const payload = res.json.mock.calls[0]?.[0] as {
      resultado: { validas: number; invalidas: number; coleccion: string };
    };
    expect(payload.resultado.coleccion).toBe('questions_v2');
    expect(payload.resultado.validas).toBe(1);
    expect(payload.resultado.invalidas).toBe(0);
  });

  it('respetar_estado=true conserva aprobado y verificación', async () => {
    const res = respuesta();
    await handler(
      request(jsonl({ ...base, id: 'T1-P02' }), { respetar: true }) as never,
      res as never,
    );
    const documento = mocks.setLote.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(documento['estado']).toBe('aprobado');
    expect(documento['verificada']).toBe(true);
  });

  it('respetar_estado=true rechaza una aprobada incompleta', async () => {
    const res = respuesta();
    await handler(
      request(
        jsonl({
          ...base,
          id: 'T1-P03',
          opciones: { A: '10', B: '', C: '30', D: '40' },
        }),
        { respetar: true },
      ) as never,
      res as never,
    );
    expect(mocks.setLote).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0]?.[0] as {
      resultado: { validas: number; invalidas: number; errores: { linea: number }[] };
    };
    expect(payload.resultado.validas).toBe(0);
    expect(payload.resultado.invalidas).toBe(1);
    expect(payload.resultado.errores[0]?.linea).toBe(1);
  });

  it('reporta líneas con JSON inválido y duplicados', async () => {
    const res = respuesta();
    const linea = JSON.stringify({ ...base, id: 'T1-P04' });
    await handler(request(`${linea}\n{ no-json\n${linea}`) as never, res as never);
    const payload = res.json.mock.calls[0]?.[0] as {
      resultado: { validas: number; invalidas: number; errores: { errores: string[] }[] };
    };
    expect(payload.resultado.validas).toBe(1);
    expect(payload.resultado.invalidas).toBe(2);
    const motivos = payload.resultado.errores.flatMap((e) => e.errores).join(' ');
    expect(motivos).toContain('JSON inválido');
    expect(motivos).toContain('duplicado');
  });

  it('rechaza archivos sin extensión .jsonl', async () => {
    const res = respuesta();
    await handler(
      request(jsonl({ ...base, id: 'T1-P05' }), { filename: 'lote.csv' }) as never,
      res as never,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.setLote).not.toHaveBeenCalled();
  });

  it('reporta filas con campos faltantes y contenido vacío', async () => {
    const res = respuesta();
    await handler(
      request(
        `${JSON.stringify({ id: '', pregunta: '', opciones: [], imagenes: 'no-lista' })}\n\n${JSON.stringify({ id: 'P1', area: 'x' })}`,
      ) as never,
      res as never,
    );
    const payload = res.json.mock.calls[0]?.[0] as {
      resultado: { invalidas: number; errores: { errores: string[] }[] };
    };
    expect(payload.resultado.invalidas).toBe(2);
    expect(payload.resultado.errores.flatMap((e) => e.errores).join(' ')).toContain('id');

    const empty = respuesta();
    await handler(request('') as never, empty as never);
    expect(empty.status).toHaveBeenCalledWith(400);
  });

  it('rechaza método no permitido', async () => {
    const res = respuesta();
    const req = request(jsonl({ ...base, id: 'P2' })) as never;
    req.method = 'GET';
    await handler(req, res as never);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

describe('POST /api/import/jsonl — contextos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.commit.mockResolvedValue(undefined);
  });

  it('importa un contexto en contexts_v2', async () => {
    const res = respuesta();
    const contexto = {
      id: 'T2-C01',
      area: 'razonamiento_logico',
      subtema: 'RL15 Gráficas y tablas',
      texto: 'Tabla de eliminatoria',
      titulo: 'Preguntas del 1 al 4',
      imagenes: [{ url: 'https://host/T2-C01.png', rol: 'contexto', orden: 1 }],
    };
    await handler(
      request(jsonl(contexto), {
        query: { tipo: 'contextos' },
        filename: 'contexts.jsonl',
      }) as never,
      res as never,
    );

    const coleccion = mocks.collection.mock.calls[0]?.[0];
    expect(coleccion).toBe('contexts_v2');
    const documento = mocks.setLote.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(documento['id']).toBe('T2-C01');
    expect(documento['texto']).toBe('Tabla de eliminatoria');
  });

  it('rechaza un contexto sin texto', async () => {
    const res = respuesta();
    await handler(
      request(jsonl({ id: 'T2-C02', area: 'razonamiento_logico', imagenes: [] }), {
        query: { tipo: 'contextos' },
      }) as never,
      res as never,
    );
    expect(mocks.setLote).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0]?.[0] as {
      resultado: { invalidas: number; errores: { errores: string[] }[] };
    };
    expect(payload.resultado.invalidas).toBe(1);
    expect(payload.resultado.errores[0]?.errores.join(' ')).toContain('texto');
  });

  it('valida referencias inválidas y duplicados de contextos', async () => {
    const res = respuesta();
    await handler(
      request(
        jsonl(
          { id: 'C1', texto: 'Texto', imagenes: 'no-lista', contexto_ids: ['P1'] },
          { id: 'C1', texto: 'Duplicado', imagenes: [] },
        ),
        { query: { tipo: 'contextos' } },
      ) as never,
      res as never,
    );
    const payload = res.json.mock.calls[0]?.[0] as {
      resultado: { invalidas: number; errores: { errores: string[] }[] };
    };
    expect(payload.resultado.invalidas).toBe(2);
    expect(payload.resultado.errores.flatMap((e) => e.errores).join(' ')).toContain(
      'imagenes',
    );
  });
});
