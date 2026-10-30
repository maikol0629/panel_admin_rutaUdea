import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  verifyIdToken: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  batch: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  COLECCION_CONTEXTS: 'contexts_v2',
  COLECCION_QUESTIONS: 'questions_v2',
  COLECCION_QUESTIONS_LEGACY: 'questions',
  COLECCION_SETTINGS: 'settings',
  COLECCION_BANK_MANIFEST: 'bank_manifest',
  getAdminAuth: () => ({ verifyIdToken: mocks.verifyIdToken }),
  requireAdmin: mocks.requireAdmin,
  adminErrorStatus: (error: { status?: number }) => error?.status ?? 500,
  getAdminDb: () => ({
    collection: mocks.collection,
    batch: mocks.batch,
  }),
}));

import contextsHandler from '../pages/api/contexts';
import contextHandler from '../pages/api/contexts/[id]';
import questionsHandler from '../pages/api/questions';
import settingsHandler from '../pages/api/settings';
import csvHandler from '../pages/api/import/csv';
import loginHandler from '../pages/api/auth/login';
import verifyHandler from '../pages/api/auth/verify';
import manifestHandler from '../pages/api/bank/manifest';
import questionHandler from '../pages/api/questions/[id]';

function response() {
  const res = {
    statusCode: 0,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name] = value;
      return res;
    },
  };
  return res;
}

function request(
  method: string,
  query: Record<string, string> = {},
  body: unknown = {},
  extra: Record<string, unknown> = {},
) {
  return {
    method,
    query,
    body,
    headers: { authorization: 'Bearer test', ...extra },
  } as never;
}

function doc(id: string, data: Record<string, unknown>) {
  return { id, exists: true, data: () => data };
}

function configureDb(
  options: {
    docs?: { id: string; data: Record<string, unknown> }[];
    one?: { id: string; data: Record<string, unknown>; exists?: boolean };
    refs?: { id: string; data: Record<string, unknown> }[];
    emptyRefs?: boolean;
  } = {},
) {
  const docs = (options.docs ?? []).map((item) => doc(item.id, item.data));
  const refs = (options.refs ?? []).map((item) => doc(item.id, item.data));
  const one = options.one
    ? { ...doc(options.one.id, options.one.data), exists: options.one.exists ?? true }
    : { id: 'config', exists: false, data: () => ({}) };
  mocks.doc.mockReturnValue({
    get: vi.fn().mockResolvedValue(one),
    set: mocks.set,
    delete: mocks.delete,
  });
  const list = vi.fn().mockResolvedValue({ docs });
  const references = vi.fn().mockResolvedValue({
    docs: refs,
    empty: options.emptyRefs ?? refs.length === 0,
  });
  mocks.limit.mockReturnValue({ get: list });
  mocks.where.mockReturnValue({
    limit: vi.fn().mockReturnValue({ get: references }),
  });
  mocks.collection.mockReturnValue({
    doc: mocks.doc,
    limit: mocks.limit,
    where: mocks.where,
  });
}

const pregunta = {
  bank_version: 'udea-2026-10-v1',
  schema_version: 2,
  area: 'razonamiento_logico',
  componente: 'Razonamiento Lógico',
  subtema: 'RL02 Porcentajes',
  dificultad: 'media',
  pregunta: '¿Cuánto es 10 % de 100?',
  opciones: { A: '10', B: '20', C: '30', D: '40' },
  respuesta_correcta: 'A',
  verificada: true,
  imagenes: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ uid: 'qa', rol: 'admin', nombre: 'QA' });
  mocks.set.mockResolvedValue(undefined);
  mocks.delete.mockResolvedValue(undefined);
  mocks.commit.mockResolvedValue(undefined);
  mocks.batch.mockReturnValue({ set: mocks.set, commit: mocks.commit });
});

describe('contexts API', () => {
  it('lista y filtra contextos, normalizando imágenes', async () => {
    configureDb({
      docs: [
        {
          id: 'T2-C01',
          data: {
            area: 'competencia_lectora',
            texto: 'Texto sobre tablas',
            titulo: 'Tabla',
            imagenes: [{ url: ' https://host/x.png ', orden: 2 }],
            preguntas_ids: ['T2-P01', 2],
          },
        },
        { id: 'T1-C01', data: { area: 'razonamiento_logico', texto: 'Otro' } },
      ],
    });
    const res = response();
    await contextsHandler(
      request('GET', { search: 'tabla', area: 'competencia_lectora' }),
      res as never,
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as { total: number }).total).toBe(1);
    expect(
      (res.body as { contextos: { imagenes: { url: string }[] }[] }).contextos[0]
        ?.imagenes[0]?.url,
    ).toBe('https://host/x.png');
  });

  it('valida y guarda un contexto', async () => {
    configureDb();
    const res = response();
    await contextsHandler(
      request('POST', {}, { id: 'C1', area: 'razonamiento_logico', texto: 'Texto' }),
      res as never,
    );
    expect(res.statusCode).toBe(200);
    expect(mocks.set).toHaveBeenCalled();
  });

  it('rechaza contexto incompleto y métodos no permitidos', async () => {
    configureDb();
    const missing = response();
    await contextsHandler(request('POST', {}, { id: 'C1' }), missing as never);
    expect(missing.statusCode).toBe(400);
    const method = response();
    await contextsHandler(request('DELETE'), method as never);
    expect(method.statusCode).toBe(405);
  });

  it('consulta, actualiza y elimina contextos sin referencias', async () => {
    configureDb({
      one: { id: 'C1', data: { texto: 'Texto', metadatos: { origen: 'test' } } },
      refs: [],
    });
    const getRes = response();
    await contextHandler(request('GET', { id: 'C1' }), getRes as never);
    expect(getRes.statusCode).toBe(200);
    configureDb({
      one: { id: 'C1', data: { texto: 'Texto' } },
      refs: [],
    });
    const putRes = response();
    await contextHandler(
      request('PUT', { id: 'C1' }, { texto: 'Nuevo texto' }),
      putRes as never,
    );
    expect(putRes.statusCode).toBe(200);
    configureDb({
      one: { id: 'C1', data: { texto: 'Texto' } },
      refs: [],
    });
    const deleteRes = response();
    await contextHandler(request('DELETE', { id: 'C1' }), deleteRes as never);
    expect(deleteRes.statusCode).toBe(200);
    expect(mocks.delete).toHaveBeenCalled();
  });

  it('bloquea borrado con referencias y valida ID', async () => {
    configureDb({
      one: { id: 'C1', data: { texto: 'Texto' } },
      refs: [{ id: 'T1-P01', data: { estado: 'aprobado', pregunta: 'P' } }],
    });
    const blocked = response();
    await contextHandler(request('DELETE', { id: 'C1' }), blocked as never);
    expect(blocked.statusCode).toBe(409);
    const missing = response();
    await contextHandler(request('GET'), missing as never);
    expect(missing.statusCode).toBe(400);
  });

  it('valida actualizaciones y documentos inexistentes', async () => {
    configureDb({ one: { id: 'C1', data: { texto: 'Texto' } } });
    const emptyText = response();
    await contextHandler(
      request('PUT', { id: 'C1' }, { texto: ' ' }),
      emptyText as never,
    );
    expect(emptyText.statusCode).toBe(400);
    configureDb({ one: { id: 'C1', data: { texto: 'Texto' } } });
    const images = response();
    await contextHandler(
      request('PUT', { id: 'C1' }, { imagenes: 'no-lista' }),
      images as never,
    );
    expect(images.statusCode).toBe(400);
    configureDb({ one: { id: 'C1', data: {}, exists: false }, refs: [] });
    const absent = response();
    await contextHandler(request('GET', { id: 'C1' }), absent as never);
    expect(absent.statusCode).toBe(404);
  });

  it('rechaza métodos no permitidos en endpoints relacionados', async () => {
    configureDb();
    const contexts = response();
    await contextsHandler(request('PATCH'), contexts as never);
    expect(contexts.statusCode).toBe(405);
    const questions = response();
    await questionsHandler(request('PATCH'), questions as never);
    expect(questions.statusCode).toBe(405);
    const settings = response();
    await settingsHandler(request('POST'), settings as never);
    expect(settings.statusCode).toBe(405);
    const manifest = response();
    await manifestHandler(request('PUT'), manifest as never);
    expect(manifest.statusCode).toBe(405);
    const detail = response();
    await contextHandler(request('PATCH', { id: 'C1' }), detail as never);
    expect(detail.statusCode).toBe(405);
  });

  it('cubre filtros de versión y validaciones de creación', async () => {
    configureDb({
      docs: [
        {
          id: 'C1',
          data: { area: 'razonamiento_logico', bank_version: 'v1', texto: 'Texto' },
        },
      ],
    });
    const filtered = response();
    await contextsHandler(
      request('GET', { bank_version: 'v1', search: 'no-existe' }),
      filtered as never,
    );
    expect((filtered.body as { total: number }).total).toBe(0);
    for (const body of [{}, { id: 'C1' }, { id: 'C1', texto: 'Texto' }]) {
      configureDb();
      const invalid = response();
      await contextsHandler(request('POST', {}, body), invalid as never);
      expect(invalid.statusCode).toBe(400);
    }
    configureDb({ one: { id: 'C1', data: {}, exists: false }, refs: [] });
    const missingPut = response();
    await contextHandler(
      request('PUT', { id: 'C1' }, { texto: 'Nuevo' }),
      missingPut as never,
    );
    expect(missingPut.statusCode).toBe(404);
    configureDb({ one: { id: 'C1', data: {}, exists: false }, refs: [] });
    const missingDelete = response();
    await contextHandler(request('DELETE', { id: 'C1' }), missingDelete as never);
    expect(missingDelete.statusCode).toBe(404);
  });
});

describe('questions API', () => {
  it('filtra, ordena y pagina preguntas', async () => {
    configureDb({
      docs: [
        { id: 'T1-P01', data: pregunta },
        {
          id: 'T1-P02',
          data: {
            ...pregunta,
            pregunta: 'Incompleta',
            opciones: { A: '', B: '2', C: '3', D: '4' },
          },
        },
      ],
    });
    const res = response();
    await questionsHandler(
      request('GET', { incompletas: 'true', orderDir: 'desc', limit: '1' }),
      res as never,
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as { total: number; totalIncompletas: number }).total).toBe(1);
    expect((res.body as { preguntas: unknown[] }).preguntas).toHaveLength(1);
  });

  it('cubre los filtros avanzados y el banco legacy', async () => {
    configureDb({
      docs: [
        {
          id: 'T1-P01',
          data: {
            ...pregunta,
            bank_version: 'udea-2026-10-v1',
            confianza_modelo: 'alta',
            tarea: 'T1',
            opciones_en_imagen: true,
            imagenes: [{ url: 'https://host/x.png', rol: 'pregunta', orden: 1 }],
          },
        },
      ],
    });
    const res = response();
    await questionsHandler(
      request('GET', {
        banco: 'legacy',
        area: 'razonamiento_logico',
        subtema: 'RL02 Porcentajes',
        dificultad: 'media',
        estado: 'pendiente',
        bank_version: 'udea-2026-10-v1',
        confianza: 'alta',
        tarea: 'T1',
        con_imagen: 'true',
        opciones_en_imagen: 'true',
        search: 'porcentaje',
        id: 'T1',
        orderBy: 'pregunta',
        limit: '0',
        page: '0',
      }),
      res as never,
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as { banco: string; soloLectura: boolean }).banco).toBe('legacy');
    const missingId = response();
    await questionsHandler(request('GET', { id: 'does-not-exist' }), missingId as never);
    expect(missingId.statusCode).toBe(200);
  });

  it('crea una pregunta pendiente y valida taxonomía', async () => {
    configureDb();
    const res = response();
    await questionsHandler(
      request('POST', {}, { id: 'T1-P01', ...pregunta }),
      res as never,
    );
    expect(res.statusCode).toBe(200);
    expect((mocks.set.mock.calls[0]?.[0] as Record<string, unknown>).estado).toBe(
      'pendiente',
    );
    const invalid = response();
    await questionsHandler(
      request('POST', {}, { ...pregunta, subtema: 'Inventado' }),
      invalid as never,
    );
    expect(invalid.statusCode).toBe(400);
    const missing = response();
    await questionsHandler(request('POST', {}, { id: 'P1' }), missing as never);
    expect(missing.statusCode).toBe(400);
  });
});

describe('question detail API', () => {
  it('consulta, edita y deshabilita una pregunta v2', async () => {
    configureDb({ one: { id: 'T1-P01', data: { ...pregunta, estado: 'pendiente' } } });
    const getRes = response();
    await questionHandler(request('GET', { id: 'T1-P01' }), getRes as never);
    expect(getRes.statusCode).toBe(200);

    configureDb({ one: { id: 'T1-P01', data: { ...pregunta, estado: 'pendiente' } } });
    const putRes = response();
    await questionHandler(
      request(
        'PUT',
        { id: 'T1-P01' },
        { pregunta: 'Actualizada', contexto_ids: ['C1', 2] },
      ),
      putRes as never,
    );
    expect(putRes.statusCode).toBe(200);

    configureDb({ one: { id: 'T1-P01', data: { ...pregunta, estado: 'aprobado' } } });
    const deleteRes = response();
    await questionHandler(
      request('DELETE', { id: 'T1-P01' }, { motivo: 'Revisión QA' }),
      deleteRes as never,
    );
    expect(deleteRes.statusCode).toBe(200);
  });

  it('normaliza todos los campos editables del formulario', async () => {
    configureDb({ one: { id: 'T1-P01', data: { ...pregunta, estado: 'pendiente' } } });
    const res = response();
    await questionHandler(
      request(
        'PUT',
        { id: 'T1-P01' },
        {
          opciones: ['1', '2', '3', '4'],
          imagenes: [{ url: 'https://host/x.png' }],
          respuesta_correcta: null,
          dificultad: ' ALTA ',
          numero: 3,
          verificada: true,
          requiere_imagen: true,
          opciones_en_imagen: false,
          duplicado: false,
          contexto_ids: ['C1', 4],
          metadatos: { fuente: 'qa' },
          notas: 'nota',
        },
      ),
      res as never,
    );
    expect(res.statusCode).toBe(200);
  });

  it('maneja lectura legacy, aprobación inválida y acciones de revisión', async () => {
    configureDb({ one: { id: 'T1-P01', data: { ...pregunta, estado: 'pendiente' } } });
    const legacy = response();
    await questionHandler(
      request('GET', { id: 'T1-P01', banco: 'legacy' }),
      legacy as never,
    );
    expect(legacy.statusCode).toBe(200);
    configureDb({
      one: {
        id: 'T1-P01',
        data: {
          ...pregunta,
          estado: 'pendiente',
          verificada: false,
          opciones: { ...pregunta.opciones, B: '' },
        },
      },
    });
    const approve = response();
    await questionHandler(
      request('PUT', { id: 'T1-P01' }, { accion: 'aprobar' }),
      approve as never,
    );
    expect(approve.statusCode).toBe(400);
    configureDb({ one: { id: 'T1-P01', data: { ...pregunta, estado: 'aprobado' } } });
    const pending = response();
    await questionHandler(
      request('PUT', { id: 'T1-P01' }, { accion: 'pendiente' }),
      pending as never,
    );
    expect(pending.statusCode).toBe(200);
    configureDb({ one: { id: 'T1-P01', data: { ...pregunta, estado: 'aprobado' } } });
    const reject = response();
    await questionHandler(
      request('PUT', { id: 'T1-P01' }, { accion: 'rechazar' }),
      reject as never,
    );
    expect(reject.statusCode).toBe(400);
    const legacyDelete = response();
    await questionHandler(
      request('DELETE', { id: 'T1-P01', banco: 'legacy' }, { motivo: 'x' }),
      legacyDelete as never,
    );
    expect(legacyDelete.statusCode).toBe(403);
  });

  it('rechaza edición legacy, acciones desconocidas y motivos ausentes', async () => {
    configureDb();
    const legacy = response();
    await questionHandler(
      request('PUT', { id: 'T1-P01', banco: 'legacy' }, {}),
      legacy as never,
    );
    expect(legacy.statusCode).toBe(403);
    configureDb({ one: { id: 'T1-P01', data: { ...pregunta, estado: 'pendiente' } } });
    const action = response();
    await questionHandler(
      request('PUT', { id: 'T1-P01' }, { accion: 'no-existe' }),
      action as never,
    );
    expect(action.statusCode).toBe(400);
    const missing = response();
    await questionHandler(request('DELETE', { id: 'T1-P01' }), missing as never);
    expect(missing.statusCode).toBe(400);
    configureDb({ one: { id: 'T1-P01', data: { ...pregunta, estado: 'pendiente' } } });
    const invalidOptions = response();
    await questionHandler(
      request('PUT', { id: 'T1-P01' }, { opciones: 'no-lista' }),
      invalidOptions as never,
    );
    expect(invalidOptions.statusCode).toBe(400);
    configureDb({ one: { id: 'T1-P01', data: { ...pregunta, estado: 'pendiente' } } });
    const invalidResponse = response();
    await questionHandler(
      request('PUT', { id: 'T1-P01' }, { respuesta_correcta: 4 }),
      invalidResponse as never,
    );
    expect(invalidResponse.statusCode).toBe(400);
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const missingId = response();
      await questionHandler(request(method), missingId as never);
      expect(missingId.statusCode).toBe(400);
    }
  });
});

describe('settings API', () => {
  it('crea configuración por defecto y actualiza valores', async () => {
    configureDb();
    const getRes = response();
    await settingsHandler(request('GET'), getRes as never);
    expect(getRes.statusCode).toBe(200);
    expect(mocks.set).toHaveBeenCalled();

    configureDb({ one: { id: 'config', data: { tiempo_simulacro_minutos: 100 } } });
    const putRes = response();
    await settingsHandler(
      request(
        'PUT',
        {},
        { tiempo_simulacro_minutos: 90, politica_repeticion: 'relajada' },
      ),
      putRes as never,
    );
    expect(putRes.statusCode).toBe(200);
  });

  it('rechaza valores de configuración inválidos', async () => {
    configureDb();
    for (const body of [
      { tiempo_simulacro_minutos: 0 },
      { inactividad_max_minutos: -1 },
      { politica_repeticion: 'otra' },
      { distribucion_dificultad: { baja: -1, media: 1, alta: 1 } },
      { distribucion_dificultad: { baja: 0, media: 0, alta: 0 } },
    ]) {
      const res = response();
      await settingsHandler(request('PUT', {}, body), res as never);
      expect(res.statusCode).toBe(400);
    }
    const malformed = response();
    await settingsHandler(
      request('PUT', {}, { distribucion_dificultad: { baja: 100, media: 100, alta: 1 } }),
      malformed as never,
    );
    expect(malformed.statusCode).toBe(400);
  });
});

describe('CSV import API', () => {
  const headers =
    'id,componente,subtema,dificultad,pregunta,opcion_a,opcion_b,opcion_c,opcion_d,respuesta_correcta,explicacion,tiene_contexto_compartido,descripcion_contexto';
  const valid = 'T1-P01,RL02,Porcentajes,media,Texto,1,2,3,4,A,Explicacion,no,';

  function csvRequest(content: string, filename = 'preguntas.csv') {
    const body = Buffer.from(JSON.stringify({ filename, content }));
    const stream = (async function* () {
      yield body;
    })();
    return Object.assign(stream, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    }) as never;
  }

  it('importa filas válidas y reporta inválidas', async () => {
    configureDb();
    const res = response();
    await csvHandler(
      csvRequest(`${headers}\n${valid}\nT1-P01,RL02,Porcentajes,media,,,,,,,`),
      res as never,
    );
    expect(res.statusCode).toBe(200);
    expect(
      (res.body as { resultado: { preguntasInsertadas: number } }).resultado
        .preguntasInsertadas,
    ).toBe(1);
  });

  it('valida archivo, extensión y encabezados', async () => {
    for (const [content, filename] of [
      ['', 'preguntas.csv'],
      ['id\nx', 'preguntas.csv'],
      [`${headers}\n${valid}`, 'preguntas.txt'],
    ]) {
      configureDb();
      const res = response();
      await csvHandler(csvRequest(content, filename), res as never);
      expect(res.statusCode).toBe(400);
    }
  });
});

describe('auth APIs', () => {
  it('verifica admin y rechaza métodos', async () => {
    const ok = response();
    await verifyHandler(request('POST'), ok as never);
    expect(ok.statusCode).toBe(200);
    const method = response();
    await verifyHandler(request('GET'), method as never);
    expect(method.statusCode).toBe(405);
    const loginMethod = response();
    await loginHandler(request('GET'), loginMethod as never);
    expect(loginMethod.statusCode).toBe(405);
  });

  describe('manifest API', () => {
    it('calcula estado de publicación y publica un lote válido', async () => {
      const valid = {
        ...pregunta,
        estado: 'aprobado',
        updated_at: '2026-10-25T00:00:00Z',
      };
      const manifestDoc = { id: 'active', exists: false, data: () => ({}) };
      mocks.collection.mockImplementation((name: string) => {
        if (name === 'questions_v2') {
          return {
            limit: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ docs: [doc('P1', valid)] }),
            }),
          };
        }
        if (name === 'contexts_v2') {
          return {
            limit: vi
              .fn()
              .mockReturnValue({ get: vi.fn().mockResolvedValue({ docs: [] }) }),
          };
        }
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(manifestDoc),
          }),
        };
      });
      const getRes = response();
      await manifestHandler(request('GET'), getRes as never);
      expect(getRes.statusCode).toBe(200);
      const postRes = response();
      await manifestHandler(
        request('POST', {}, { confirmar: true, bank_version: 'udea-2026-10-v1' }),
        postRes as never,
      );
      expect(postRes.statusCode).toBe(200);
    });

    it('rechaza publicación sin confirmación o sin preguntas aprobadas', async () => {
      configureDb();
      const noConfirm = response();
      await manifestHandler(request('POST', {}, {}), noConfirm as never);
      expect(noConfirm.statusCode).toBe(400);
      const noApproved = response();
      await manifestHandler(
        request('POST', {}, { confirmar: true, bank_version: 'udea-2026-10-v1' }),
        noApproved as never,
      );
      expect(noApproved.statusCode).toBe(400);
    });

    it('rechaza imágenes sin URL y contextos inexistentes', async () => {
      const invalid = {
        ...pregunta,
        estado: 'aprobado',
        contexto_ids: ['C-MISSING'],
        imagenes: [{ rol: 'pregunta', orden: 1 }],
      };
      mocks.collection.mockImplementation((name: string) => {
        if (name === 'questions_v2') {
          return {
            limit: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ docs: [doc('P1', invalid)] }),
            }),
          };
        }
        if (name === 'contexts_v2') {
          return {
            limit: vi
              .fn()
              .mockReturnValue({ get: vi.fn().mockResolvedValue({ docs: [] }) }),
          };
        }
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
          }),
        };
      });
      const res = response();
      await manifestHandler(
        request('POST', {}, { confirmar: true, bank_version: 'udea-2026-10-v1' }),
        res as never,
      );
      expect(res.statusCode).toBe(400);
      expect((res.body as { motivos: string[] }).motivos.length).toBeGreaterThan(0);
    });
  });

  it('inicia sesión, valida token ausente y token inválido', async () => {
    const missing = response();
    await loginHandler(request('POST', {}, {}), missing as never);
    expect(missing.statusCode).toBe(400);
    mocks.verifyIdToken.mockResolvedValueOnce({
      uid: 'u1',
      email: 'qa@example.test',
      name: 'QA',
      rol: 'admin',
    });
    const ok = response();
    await loginHandler(request('POST', {}, { idToken: 'token' }), ok as never);
    expect(ok.statusCode).toBe(200);
    mocks.verifyIdToken.mockRejectedValueOnce(new Error('ID token has expired'));
    const invalid = response();
    await loginHandler(request('POST', {}, { idToken: 'token' }), invalid as never);
    expect(invalid.statusCode).toBe(401);
  });

  it('rechaza un token sin rol admin', async () => {
    mocks.verifyIdToken.mockResolvedValueOnce({ uid: 'u1', rol: 'user' });
    mocks.requireAdmin.mockRejectedValueOnce(
      Object.assign(new Error('Se requiere rol admin'), { status: 403 }),
    );
    const res = response();
    await loginHandler(request('POST', {}, { idToken: 'token' }), res as never);
    expect(res.statusCode).toBe(403);
    mocks.requireAdmin.mockRejectedValueOnce(
      Object.assign(new Error('Token inválido'), { status: 401 }),
    );
    const verify = response();
    await verifyHandler(request('POST'), verify as never);
    expect(verify.statusCode).toBe(401);
  });

  it('devuelve error interno para una credencial no reconocida', async () => {
    mocks.verifyIdToken.mockRejectedValueOnce(new Error('unexpected failure'));
    const res = response();
    await loginHandler(request('POST', {}, { idToken: 'token' }), res as never);
    expect(res.statusCode).toBe(500);
  });
});
