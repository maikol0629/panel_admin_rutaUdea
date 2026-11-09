/**
 * Pruebas de GET /api/historial.
 *
 * La colección se mockea en memoria: se valida el orden, la paginación y todos
 * los filtros sin tocar Firestore.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  get: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  COLECCION_HISTORIAL: 'historialPreguntas',
  getAdminDb: () => ({
    collection: () => ({
      limit: () => ({ get: hoisted.get }),
      where: () => ({ limit: () => ({ get: hoisted.get }) }),
    }),
  }),
  requireAdmin: hoisted.requireAdmin,
  adminErrorStatus: (error: { status?: number }) => error?.status ?? 500,
}));

import handler from '../pages/api/historial';

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

function fakeRequest(method: string, query: Record<string, string> = {}) {
  return {
    method,
    query,
    body: {},
    headers: { authorization: 'Bearer qa-token' },
  } as never;
}

function evento(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

const eventos = [
  evento('evt-1', {
    preguntaId: 'P1',
    fecha: '2026-11-09T10:00:00.000Z',
    fechaMs: Date.parse('2026-11-09T10:00:00.000Z'),
    actorUid: 'uid-ana',
    actorNombre: 'Ana',
    actorRol: 'admin',
    accion: 'edicion',
    origen: 'panel',
    campos: ['pregunta'],
    resumen: 'Se actualizó Enunciado.',
    cambios: { pregunta: { antes: 'a', despues: 'b' } },
  }),
  evento('evt-2', {
    preguntaId: 'P1',
    fecha: '2026-11-09T11:00:00.000Z',
    fechaMs: Date.parse('2026-11-09T11:00:00.000Z'),
    actorUid: 'uid-luis',
    actorNombre: 'Luis',
    actorRol: 'admin',
    accion: 'revision',
    origen: 'reporte',
    reporteId: 'rep-1',
    campos: ['estado'],
    resumen: 'Aprobada',
    cambios: { estado: { antes: 'pendiente', despues: 'aprobado' } },
  }),
  evento('evt-3', {
    preguntaId: 'P2',
    fecha: '2026-11-09T12:00:00.000Z',
    fechaMs: Date.parse('2026-11-09T12:00:00.000Z'),
    actorUid: 'uid-ana',
    actorNombre: 'Ana',
    actorRol: 'admin',
    accion: 'importacion',
    origen: 'importacion',
    campos: [],
    resumen: 'Pregunta importada desde lote.jsonl.',
    snapshot: { pregunta: 'Importada' },
  }),
  evento('evt-4', {
    preguntaId: 'P2',
    fecha: '2026-11-09T13:00:00.000Z',
    fechaMs: Date.parse('2026-11-09T13:00:00.000Z'),
    actorUid: 'uid-carlos',
    actorNombre: 'Carlos',
    actorRol: 'superadmin',
    accion: 'deshabilitacion',
    origen: 'panel',
    campos: ['estado'],
    resumen: 'Pregunta deshabilitada: Duplicada',
    cambios: { estado: { antes: 'aprobado', despues: 'deshabilitado' } },
  }),
];

beforeEach(() => {
  hoisted.get.mockReset();
  hoisted.requireAdmin.mockReset();
  hoisted.requireAdmin.mockResolvedValue({
    uid: 'qa',
    rol: 'admin',
    nombre: 'QA',
  });
  hoisted.get.mockResolvedValue({
    docs: eventos.map((item) => ({
      id: item.id,
      data: item.data,
    })),
  });
});

describe('GET /api/historial', () => {
  it('ordena por fecha descendente y pagina', async () => {
    const res = fakeResponse();
    await handler(fakeRequest('GET', { page: '1', limit: '2' }), res as never);
    expect(res.statusCode).toBe(200);
    const body = res.body as {
      eventos: { id: string }[];
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
    expect(body.eventos.map((e) => e.id)).toEqual(['evt-4', 'evt-3']);
    expect(body.total).toBe(4);
    expect(body.totalPages).toBe(2);
    expect(body.hasMore).toBe(true);
  });

  it('filtra por pregunta, acción, origen, campo, actor, reporte y texto', async () => {
    const casos: { query: Record<string, string>; ids: string[] }[] = [
      { query: { preguntaId: 'P1' }, ids: ['evt-2', 'evt-1'] },
      { query: { accion: 'revision' }, ids: ['evt-2'] },
      { query: { origen: 'importacion' }, ids: ['evt-3'] },
      { query: { campo: 'estado' }, ids: ['evt-4', 'evt-2'] },
      { query: { actor: 'ana' }, ids: ['evt-3', 'evt-1'] },
      { query: { reporteId: 'rep-1' }, ids: ['evt-2'] },
      { query: { q: 'duplicada' }, ids: ['evt-4'] },
    ];

    for (const caso of casos) {
      const res = fakeResponse();
      await handler(fakeRequest('GET', caso.query), res as never);
      expect(res.statusCode).toBe(200);
      const body = res.body as { eventos: { id: string }[] };
      expect(body.eventos.map((e) => e.id)).toEqual(caso.ids);
    }
  });

  it('filtra por rango de fechas en ISO y milisegundos', async () => {
    const iso = fakeResponse();
    await handler(
      fakeRequest('GET', {
        desde: '2026-11-09T11:00:00.000Z',
        hasta: '2026-11-09T12:00:00.000Z',
      }),
      iso as never,
    );
    expect((iso.body as { eventos: { id: string }[] }).eventos.map((e) => e.id)).toEqual([
      'evt-3',
      'evt-2',
    ]);

    const ms = fakeResponse();
    await handler(
      fakeRequest('GET', { desde: String(Date.parse('2026-11-09T12:00:00.000Z')) }),
      ms as never,
    );
    expect((ms.body as { eventos: { id: string }[] }).eventos.map((e) => e.id)).toEqual([
      'evt-4',
      'evt-3',
    ]);
  });

  it('acepta filtros vacíos y valores de paginación inválidos', async () => {
    const res = fakeResponse();
    await handler(
      fakeRequest('GET', {
        preguntaId: '',
        accion: '',
        origen: '',
        campo: '',
        actor: '',
        reporteId: '',
        q: '',
        desde: '',
        hasta: '',
        page: '0',
        limit: '999',
      }),
      res as never,
    );
    expect(res.statusCode).toBe(200);
    const body = res.body as { page: number; limit: number; total: number };
    expect(body.page).toBe(1);
    expect(body.limit).toBe(200);
    expect(body.total).toBe(4);
  });

  it('responde 401 sin token admin', async () => {
    hoisted.requireAdmin.mockRejectedValue(
      Object.assign(new Error('Token requerido'), { status: 401 }),
    );
    const res = fakeResponse();
    await handler(fakeRequest('GET'), res as never);
    expect(res.statusCode).toBe(401);
  });

  it('rechaza métodos distintos de GET', async () => {
    const res = fakeResponse();
    await handler(fakeRequest('POST'), res as never);
    expect(res.statusCode).toBe(405);
  });

  it('devuelve 500 si falla la consulta', async () => {
    hoisted.get.mockRejectedValue(new Error('Firestore caído'));
    const res = fakeResponse();
    await handler(fakeRequest('GET'), res as never);
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toBe('Firestore caído');
  });
});
