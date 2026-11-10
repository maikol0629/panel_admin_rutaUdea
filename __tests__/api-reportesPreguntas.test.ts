/**
 * Pruebas de la API /api/reportesPreguntas del panel.
 *
 * - GET listado con filtros y paginación (mockeado en memoria).
 * - PATCH cambio de estado a revisado/descartado/pendiente.
 * - Sin token admin → 401.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const docs: Map<string, Record<string, unknown>> = new Map();

const hoisted = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  collectionGet: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => ({
    collection: (name: string) => {
      if (name === 'reportesPreguntas') {
        return {
          get: hoisted.collectionGet,
          doc: (id: string) => {
            (hoisted.get as unknown as { lastId?: string }).lastId = id;
            (hoisted.set as unknown as { lastId?: string }).lastId = id;
            return { get: hoisted.get, set: hoisted.set };
          },
        };
      }
      return {
        get: hoisted.collectionGet,
        doc: () => ({ get: hoisted.get, set: hoisted.set }),
      };
    },
  }),
  requireAdmin: hoisted.requireAdmin,
  adminErrorStatus: (error: { status?: number }) => error?.status ?? 500,
}));

import handler from '../pages/api/reportesPreguntas';

interface FakeResponse {
  statusCode: number;
  body: unknown;
  status: (code: number) => FakeResponse;
  json: (body: unknown) => FakeResponse;
  setHeader: () => FakeResponse;
}

function fakeResponse(): FakeResponse {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    setHeader() {
      return res;
    },
  };
  return res as unknown as FakeResponse;
}

function fakeRequest(
  method: string,
  query: Record<string, string> = {},
  body: Record<string, unknown> = {},
  token = 'Bearer admin-token',
) {
  return {
    method,
    query,
    body,
    headers: { authorization: token },
  } as never;
}

function reporteDoc(id: string, overrides: Record<string, unknown> = {}) {
  const base = {
    id,
    uid: 'usuario-1',
    questionId: 'T1-P01',
    motivo: 'enunciado_confuso',
    comentario: 'El enunciado no tiene sentido.',
    modo: 'simulacro',
    sesionId: 'sesion-abc',
    area: 'razonamiento_logico',
    subtema: 'RL02 Porcentajes',
    bancoVersion: 'udea-2026-10-v1',
    fechaMs: 1700000000000,
    appVersionCode: 42,
    estado: 'pendiente',
  };
  return { ...base, ...overrides };
}

function seed(reportes: Record<string, unknown>[]) {
  docs.clear();
  for (const r of reportes) {
    docs.set(r.id, r);
  }
}

beforeEach(() => {
  docs.clear();
  vi.resetAllMocks();
  hoisted.collectionGet.mockImplementation(async () => ({
    docs: Array.from(docs.values()).map((data) => ({
      id: data.id,
      data: () => data,
    })),
  }));
  hoisted.get.mockImplementation(async () => {
    const id = (hoisted.get as unknown as { lastId?: string }).lastId;
    const data = docs.get(id ?? '');
    return { exists: !!data, data: () => data ?? null };
  });
  hoisted.set.mockImplementation(
    async (data: Record<string, unknown>, _options?: unknown) => {
      const id = (hoisted.set as unknown as { lastId?: string }).lastId;
      docs.set(id, { ...(docs.get(id ?? '') ?? {}), ...data });
    },
  );
  hoisted.requireAdmin.mockResolvedValue({ uid: 'admin-1', rol: 'admin' });
});

describe('GET /api/reportesPreguntas', () => {
  it('devuelve listado paginado de reportes ordenados por fecha desc', async () => {
    seed([
      reporteDoc('r1', { fechaMs: 1700000000000, estado: 'pendiente' }),
      reporteDoc('r2', { fechaMs: 1700001000000, estado: 'revisado' }),
      reporteDoc('r3', { fechaMs: 1700002000000, estado: 'descartado' }),
    ]);

    const res = fakeResponse();
    await handler(fakeRequest('GET', { limit: '2', page: '1' }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      success?: boolean;
      reportes?: unknown[];
      total?: number;
      totalPages?: number;
    };
    expect(body.success).toBe(true);
    expect(body.total).toBe(3);
    expect(body.totalPages).toBe(2);
    expect(body.reportes).toHaveLength(2);
    // Más reciente primero.
    expect((body.reportes as unknown[])[0]).toMatchObject({ id: 'r3' });
  });

  it('filtra por estado', async () => {
    seed([
      reporteDoc('r1', { estado: 'pendiente' }),
      reporteDoc('r2', { estado: 'revisado' }),
    ]);

    const res = fakeResponse();
    await handler(fakeRequest('GET', { estado: 'pendiente' }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { reportes?: unknown[] };
    expect(body.reportes).toHaveLength(1);
    expect((body.reportes as unknown[])[0]).toMatchObject({ estado: 'pendiente' });
  });

  it('filtra por búsqueda de texto (q)', async () => {
    seed([reporteDoc('r1', { comentario: 'respuesta incorrecta de verdad' })]);

    const res = fakeResponse();
    await handler(fakeRequest('GET', { q: 'respuesta' }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { reportes?: unknown[] };
    expect(body.reportes).toHaveLength(1);
  });

  it('filtra por modo', async () => {
    seed([
      reporteDoc('r1', { modo: 'simulacro' }),
      reporteDoc('r2', { modo: 'practica' }),
    ]);

    const res = fakeResponse();
    await handler(fakeRequest('GET', { modo: 'practica' }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { reportes?: unknown[] };
    expect(body.reportes).toHaveLength(1);
    expect((body.reportes as unknown[])[0]).toMatchObject({ modo: 'practica' });
  });

  it('filtra por motivo', async () => {
    seed([
      reporteDoc('r1', { motivo: 'enunciado_confuso' }),
      reporteDoc('r2', { motivo: 'respuesta_incorrecta' }),
    ]);

    const res = fakeResponse();
    await handler(fakeRequest('GET', { motivo: 'respuesta_incorrecta' }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { reportes?: unknown[] };
    expect(body.reportes).toHaveLength(1);
    expect((body.reportes as unknown[])[0]).toMatchObject({
      motivo: 'respuesta_incorrecta',
    });
  });

  it('ordena de menor a mayor fecha cuando orderDir=asc', async () => {
    seed([
      reporteDoc('r1', { fechaMs: 1700002000000 }),
      reporteDoc('r2', { fechaMs: 1700000000000 }),
    ]);

    const res = fakeResponse();
    await handler(fakeRequest('GET', { orderBy: 'fechaMs', orderDir: 'asc' }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { reportes?: unknown[] };
    expect((body.reportes as unknown[])[0]).toMatchObject({ id: 'r2' });
    expect((body.reportes as unknown[])[1]).toMatchObject({ id: 'r1' });
  });

  it('devuelve 401 sin token de admin', async () => {
    hoisted.requireAdmin.mockRejectedValueOnce(
      Object.assign(new Error('no autorizado'), { status: 401 }),
    );

    const res = fakeResponse();
    await handler(fakeRequest('GET', {}, {}, ''), res);

    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /api/reportesPreguntas', () => {
  it('marca un reporte como revisado y registra auditoría', async () => {
    const r = reporteDoc('r1');
    docs.set('r1', r);

    const res = fakeResponse();
    await handler(
      fakeRequest(
        'PATCH',
        {},
        { reporteId: 'r1', estado: 'revisado', notasAdmin: 'Se corrigió el enunciado.' },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      success?: boolean;
      reporte?: { estado?: string; revisadoPor?: string };
    };
    expect(body.success).toBe(true);
    expect(body.reporte?.estado).toBe('revisado');
    expect(body.reporte?.revisadoPor).toBe('admin-1');

    const actualizado = docs.get('r1');
    expect(actualizado?.estado).toBe('revisado');
    expect(actualizado?.revisadoPor).toBe('admin-1');
    expect(actualizado?.notasAdmin).toBe('Se corrigió el enunciado.');
    expect(actualizado?.fechaRevision).toBeDefined();
  });

  it('reabre un reporte a pendiente y limpia auditoría', async () => {
    const r = reporteDoc('r1', {
      estado: 'revisado',
      revisadoPor: 'admin-1',
      fechaRevision: '2026-01-01',
    });
    docs.set('r1', r);

    const res = fakeResponse();
    await handler(
      fakeRequest('PATCH', {}, { reporteId: 'r1', estado: 'pendiente' }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const actualizado = docs.get('r1');
    expect(actualizado?.estado).toBe('pendiente');
    expect(actualizado?.revisadoPor).toBeNull();
    expect(actualizado?.fechaRevision).toBeNull();
  });

  it('devuelve 404 si el reporte no existe', async () => {
    const res = fakeResponse();
    await handler(
      fakeRequest('PATCH', {}, { reporteId: 'no-existe', estado: 'revisado' }),
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('devuelve 400 si el estado es inválido', async () => {
    const res = fakeResponse();
    await handler(fakeRequest('PATCH', {}, { reporteId: 'r1', estado: 'invalido' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('devuelve 400 si falta el reporteId', async () => {
    const res = fakeResponse();
    await handler(fakeRequest('PATCH', {}, { estado: 'revisado' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('devuelve 400 si falta el estado', async () => {
    const res = fakeResponse();
    await handler(fakeRequest('PATCH', {}, { reporteId: 'r1' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('devuelve 200 cuando el reporte ya tiene ese estado y no hay notas', async () => {
    const r = reporteDoc('r1', { estado: 'revisado' });
    docs.set('r1', r);

    const res = fakeResponse();
    await handler(fakeRequest('PATCH', {}, { reporteId: 'r1', estado: 'revisado' }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { success?: boolean; mensaje?: string };
    expect(body.success).toBe(true);
    expect(body.mensaje).toContain('ya tiene ese estado');
  });

  it('devuelve 405 para métodos no permitidos', async () => {
    const res = fakeResponse();
    await handler(fakeRequest('POST'), res);
    expect(res.statusCode).toBe(405);
  });

  it('devuelve 500 cuando falla la operación', async () => {
    hoisted.set.mockRejectedValueOnce(new Error('fallo de firestore'));
    seed([reporteDoc('r1')]);

    const res = fakeResponse();
    await handler(fakeRequest('PATCH', {}, { reporteId: 'r1', estado: 'revisado' }), res);
    expect(res.statusCode).toBe(500);
  });
});
