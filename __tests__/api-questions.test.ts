/**
 * Fase 8 — Pruebas de la API del panel para los criterios G8:
 *
 * - el banco legacy `questions` es solo lectura desde el panel (PUT/DELETE 403);
 * - no se puede aprobar una pregunta sin opciones, respuesta o verificación;
 * - deshabilitar exige motivo;
 * - sin token admin la API responde 401.
 *
 * La capa de Firestore se mockea: no se escribe en staging.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  COLECCION_QUESTIONS: 'questions_v2',
  COLECCION_QUESTIONS_LEGACY: 'questions',
  getAdminDb: () => ({
    collection: () => ({
      doc: () => ({
        get: hoisted.get,
        set: hoisted.set,
      }),
    }),
  }),
  requireAdmin: hoisted.requireAdmin,
  adminErrorStatus: (error: { status?: number }) => error?.status ?? 500,
}));

import handler from '../pages/api/questions/[id]';

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
  query: Record<string, string>,
  body: Record<string, unknown> = {},
) {
  return {
    method,
    query,
    body,
    headers: { authorization: 'Bearer qa-token' },
  } as never;
}

function docValido(extra: Record<string, unknown> = {}) {
  return {
    id: 'T1-P01',
    bank_version: 'udea-2026-10-v1',
    schema_version: 2,
    area: 'razonamiento_logico',
    componente: 'Razonamiento Lógico',
    subtema: 'RL02 Porcentajes',
    dificultad: 'media',
    tipo: 'individual',
    pregunta: '¿Cuánto es el 10 % de 100?',
    opciones: { A: '10', B: '20', C: '30', D: '40' },
    respuesta_correcta: 'A',
    estado: 'pendiente',
    verificada: true,
    imagenes: [],
    requiere_imagen: false,
    opciones_en_imagen: false,
    ...extra,
  };
}

function mockDocumento(data: Record<string, unknown>) {
  hoisted.get.mockResolvedValue({
    id: 'T1-P01',
    exists: true,
    data: () => data,
  });
}

beforeEach(() => {
  hoisted.get.mockReset();
  hoisted.set.mockReset();
  hoisted.requireAdmin.mockReset();
  hoisted.requireAdmin.mockResolvedValue({ uid: 'qa', rol: 'admin', nombre: 'QA' });
  hoisted.set.mockResolvedValue(undefined);
});

describe('banco legacy en solo lectura', () => {
  it('GET legacy se marca como solo lectura', async () => {
    mockDocumento({ id: 'CL-ORG-001', estado: 'aprobado' });
    const res = fakeResponse();
    await handler(fakeRequest('GET', { id: 'CL-ORG-001', banco: 'legacy' }), res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { soloLectura: boolean }).soloLectura).toBe(true);
  });

  it('PUT legacy responde 403 sin tocar Firestore', async () => {
    const res = fakeResponse();
    await handler(
      fakeRequest('PUT', { id: 'CL-ORG-001', banco: 'legacy' }, { pregunta: 'cambio' }),
      res as never,
    );
    expect(res.statusCode).toBe(403);
    expect((res.body as { error: string }).error).toContain('solo lectura');
    expect(hoisted.set).not.toHaveBeenCalled();
  });

  it('DELETE legacy responde 403 sin tocar Firestore', async () => {
    const res = fakeResponse();
    await handler(
      fakeRequest('DELETE', { id: 'CL-ORG-001', banco: 'legacy' }, { motivo: 'prueba' }),
      res as never,
    );
    expect(res.statusCode).toBe(403);
    expect(hoisted.set).not.toHaveBeenCalled();
  });
});

describe('validación de publicación', () => {
  it('no aprueba una pregunta sin opciones ni respuesta', async () => {
    mockDocumento(
      docValido({
        opciones: { A: '10', B: '', C: '30', D: '40' },
        respuesta_correcta: null,
      }),
    );
    const res = fakeResponse();
    await handler(fakeRequest('PUT', { id: 'T1-P01' }, { accion: 'aprobar' }), res as never);
    expect(res.statusCode).toBe(400);
    const body = res.body as { faltantes: string[] };
    expect(body.faltantes).toEqual(
      expect.arrayContaining(['opcion_b', 'respuesta_correcta']),
    );
    expect(hoisted.set).not.toHaveBeenCalled();
  });

  it('no aprueba desde el formulario si la pregunta no está verificada', async () => {
    mockDocumento(docValido({ verificada: false }));
    const res = fakeResponse();
    await handler(
      fakeRequest('PUT', { id: 'T1-P01' }, { estado: 'aprobado' }),
      res as never,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { faltantes: string[] }).faltantes).toContain('verificada');
    expect(hoisted.set).not.toHaveBeenCalled();
  });

  it('aprueba una pregunta completa y firma la revisión', async () => {
    const data = docValido();
    mockDocumento(data);
    const res = fakeResponse();
    await handler(fakeRequest('PUT', { id: 'T1-P01' }, { accion: 'aprobar' }), res as never);
    expect(res.statusCode).toBe(200);
    expect(hoisted.set).toHaveBeenCalledTimes(1);
    const [cambios, opciones] = hoisted.set.mock.calls[0] as [
      Record<string, unknown>,
      { merge: boolean },
    ];
    expect(cambios['estado']).toBe('aprobado');
    expect(cambios['verificada']).toBe(true);
    expect(cambios['revisado_por']).toBe('QA');
    expect(opciones).toEqual({ merge: true });
  });

  it('deshabilitar exige motivo', async () => {
    mockDocumento(docValido({ estado: 'aprobado' }));
    const res = fakeResponse();
    await handler(
      fakeRequest('PUT', { id: 'T1-P01' }, { accion: 'deshabilitar' }),
      res as never,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toContain('motivo');
    expect(hoisted.set).not.toHaveBeenCalled();
  });
});

describe('autorización', () => {
  it('sin token admin responde 401', async () => {
    hoisted.requireAdmin.mockRejectedValue(
      Object.assign(new Error('Token de autorización requerido'), { status: 401 }),
    );
    const res = fakeResponse();
    await handler(fakeRequest('GET', { id: 'T1-P01' }), res as never);
    expect(res.statusCode).toBe(401);
  });
});
