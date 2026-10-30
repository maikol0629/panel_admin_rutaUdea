/**
 * Tests del endpoint `/api/usuarios` (gestión de usuarios y roles del panel).
 *
 * Mockea Firebase Admin para probar sin Firestore ni Auth reales:
 * - GET: listado de usuarios;
 * - POST: crear/asignar admin o superadmin por correo;
 * - PATCH: actualizar rol o estado (sin autodeshabilitarse, último superadmin);
 * - DELETE: deshabilitar usuario (último superadmin protegido);
 * - Autenticación: requireSuperadmin falla → 403/401;
 * - Método no permitido → 405.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireSuperadmin: vi.fn(),
  getUserByEmail: vi.fn(),
  setCustomUserClaims: vi.fn(),
  updateUser: vi.fn(),
  listUsers: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  where: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  COLECCION_USERS: 'users',
  getAdminAuth: () => ({
    getUserByEmail: mocks.getUserByEmail,
    setCustomUserClaims: mocks.setCustomUserClaims,
    updateUser: mocks.updateUser,
    listUsers: mocks.listUsers,
  }),
  getAdminDb: () => ({
    collection: mocks.collection,
  }),
  requireSuperadmin: mocks.requireSuperadmin,
  adminErrorStatus: (error: { status?: number }) => error?.status ?? 500,
}));

import handler from '../pages/api/usuarios';

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

function fakeRequest(method: string, body: Record<string, unknown> = {}): never {
  return {
    method,
    body,
    headers: {},
  } as never;
}

describe('GET /api/usuarios', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSuperadmin.mockResolvedValue({
      uid: 'admin-1',
      rol: 'superadmin',
    });
  });

  it('lista usuarios desde Firestore y Auth', async () => {
    const snap = {
      docs: [
        {
          id: 'uid-1',
          data: () => ({
            correo: 'a@test.com',
            nombre: 'Ana',
            rol: 'admin',
            estado: 'activo',
          }),
        },
      ],
    };
    mocks.collection.mockReturnValue({ get: vi.fn().mockResolvedValue(snap) });
    mocks.listUsers.mockResolvedValue({ users: [] });

    const res = fakeResponse();
    await handler(fakeRequest('GET'), res as never);

    expect(res.statusCode).toBe(200);
    expect((res.body as { usuarios: unknown[] }).usuarios).toEqual(expect.any(Array));
  });
});

describe('POST /api/usuarios', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSuperadmin.mockResolvedValue({
      uid: 'admin-1',
      rol: 'superadmin',
    });
  });

  it('asigna rol superadmin a un usuario existente', async () => {
    mocks.getUserByEmail.mockResolvedValue({
      uid: 'uid-super',
      email: 'super@test.com',
    });
    mocks.collection.mockReturnValue({
      doc: vi.fn().mockReturnValue({ set: vi.fn().mockResolvedValue(undefined) }),
    });

    const res = fakeResponse();
    await handler(
      fakeRequest('POST', {
        correo: 'super@test.com',
        rol: 'superadmin',
        nombre: 'Super',
      }),
      res as never,
    );

    expect(res.statusCode).toBe(200);
    expect(mocks.setCustomUserClaims).toHaveBeenCalledWith('uid-super', {
      rol: 'superadmin',
      nombre: 'Super',
    });
    expect((res.body as { success: boolean; usuario: { rol: string } }).usuario.rol).toBe(
      'superadmin',
    );
  });

  it('retorna 400 si falta el correo', async () => {
    const res = fakeResponse();
    await handler(fakeRequest('POST', { rol: 'admin' }), res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe('El correo es requerido.');
  });

  it('retorna 400 si el rol es inválido', async () => {
    const res = fakeResponse();
    await handler(
      fakeRequest('POST', { correo: 'a@test.com', rol: 'invitado' }),
      res as never,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      'El rol debe ser "admin" o "superadmin".',
    );
  });

  it('retorna 404 si el usuario no existe en Auth', async () => {
    mocks.getUserByEmail.mockRejectedValue(new Error('not found'));
    const res = fakeResponse();
    await handler(
      fakeRequest('POST', { correo: 'noexiste@test.com', rol: 'admin' }),
      res as never,
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/usuarios', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSuperadmin.mockResolvedValue({
      uid: 'admin-1',
      rol: 'superadmin',
    });
  });

  it('actualiza rol de otro usuario', async () => {
    const snap = {
      exists: true,
      data: () => ({ rol: 'admin', nombre: 'Usuario' }),
    };
    mocks.collection.mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(snap),
        set: vi.fn().mockResolvedValue(undefined),
        where: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ size: 2 }) }),
      }),
    });

    const res = fakeResponse();
    await handler(
      fakeRequest('PATCH', { uid: 'uid-2', rol: 'superadmin' }),
      res as never,
    );

    expect(res.statusCode).toBe(200);
    expect(mocks.setCustomUserClaims).toHaveBeenCalledWith('uid-2', {
      rol: 'superadmin',
      nombre: 'Usuario',
    });
  });

  it('retorna 400 si intenta autodegradarse', async () => {
    const snap = {
      exists: true,
      data: () => ({ rol: 'superadmin' }),
    };
    mocks.collection.mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(snap),
        where: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ size: 1 }) }),
      }),
    });

    const res = fakeResponse();
    await handler(fakeRequest('PATCH', { uid: 'admin-1', rol: 'admin' }), res as never);
    expect(res.statusCode).toBe(400);
  });

  it('retorna 404 si el usuario no existe en Firestore', async () => {
    const snap = { exists: false };
    mocks.collection.mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(snap) }),
    });

    const res = fakeResponse();
    await handler(fakeRequest('PATCH', { uid: 'uid-inexistente' }), res as never);
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/usuarios', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSuperadmin.mockResolvedValue({
      uid: 'admin-1',
      rol: 'superadmin',
    });
  });

  it('deshabilita un usuario', async () => {
    const snap = {
      exists: true,
      data: () => ({ rol: 'admin' }),
    };
    mocks.collection.mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(snap),
        set: vi.fn().mockResolvedValue(undefined),
        where: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ size: 2 }) }),
      }),
    });

    const res = fakeResponse();
    await handler(fakeRequest('DELETE', { uid: 'uid-2' }), res as never);

    expect(res.statusCode).toBe(200);
    expect(mocks.updateUser).toHaveBeenCalledWith('uid-2', { disabled: true });
  });

  it('retorna 400 si intenta deshabilitarse a sí mismo', async () => {
    const res = fakeResponse();
    await handler(fakeRequest('DELETE', { uid: 'admin-1' }), res as never);
    expect(res.statusCode).toBe(400);
  });

  it('retorna 404 si el usuario no existe', async () => {
    const snap = { exists: false };
    mocks.collection.mockReturnValue({
      doc: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(snap) }),
    });

    const res = fakeResponse();
    await handler(fakeRequest('DELETE', { uid: 'uid-inexistente' }), res as never);
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/usuarios — ramas de Auth sin Firestore', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSuperadmin.mockResolvedValue({
      uid: 'admin-1',
      rol: 'superadmin',
    });
  });

  it('incluye usuario de Auth sin documento en Firestore', async () => {
    mocks.collection.mockReturnValue({
      get: vi.fn().mockResolvedValue({ docs: [] }),
    });
    mocks.listUsers.mockResolvedValue({
      users: [
        {
          uid: 'auth-only',
          email: 'auth@test.com',
          displayName: 'Auth User',
          disabled: false,
          providerData: [{ providerId: 'password' }],
        },
      ],
    });

    const res = fakeResponse();
    await handler(fakeRequest('GET'), res as never);

    expect(res.statusCode).toBe(200);
    const usuarios = (res.body as { usuarios: { uid: string }[] }).usuarios;
    expect(usuarios.find((u) => u.uid === 'auth-only')).toBeDefined();
  });

  it('complementa correo y proveedor de usuario existente en Firestore', async () => {
    mocks.collection.mockReturnValue({
      get: vi.fn().mockResolvedValue({
        docs: [
          {
            id: 'uid-mix',
            data: () => ({ rol: 'admin' }),
          },
        ],
      }),
    });
    mocks.listUsers.mockResolvedValue({
      users: [
        {
          uid: 'uid-mix',
          email: 'mix@test.com',
          displayName: 'Mix',
          disabled: false,
          providerData: [{ providerId: 'google.com' }],
        },
      ],
    });

    const res = fakeResponse();
    await handler(fakeRequest('GET'), res as never);

    expect(res.statusCode).toBe(200);
  });
});

describe('PATCH /api/usuarios — ramas de protección y no-escritura', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSuperadmin.mockResolvedValue({
      uid: 'admin-1',
      rol: 'superadmin',
    });
  });

  it('no permite autodeshabilitarse (estado)', async () => {
    const snap = {
      exists: true,
      data: () => ({ rol: 'superadmin' }),
    };
    mocks.collection.mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(snap),
        where: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ size: 1 }) }),
      }),
    });

    const res = fakeResponse();
    await handler(
      fakeRequest('PATCH', { uid: 'admin-1', estado: 'deshabilitado' }),
      res as never,
    );
    expect(res.statusCode).toBe(400);
  });

  it('último superadmin: no permite deshabilitar por estado', async () => {
    const snap = {
      exists: true,
      data: () => ({ rol: 'superadmin' }),
    };
    mocks.collection.mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(snap),
        set: vi.fn().mockResolvedValue(undefined),
      }),
      where: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ size: 1 }),
      }),
    });

    const res = fakeResponse();
    await handler(
      fakeRequest('PATCH', { uid: 'uid-2', estado: 'deshabilitado' }),
      res as never,
    );
    expect(res.statusCode).toBe(400);
  });

  it('sin cambios válidos: no escribe en Firestore', async () => {
    const snap = {
      exists: true,
      data: () => ({ rol: 'admin', nombre: 'Usuario' }),
    };
    mocks.collection.mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(snap),
        set: vi.fn().mockResolvedValue(undefined),
      }),
      where: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ size: 2 }),
      }),
    });

    const res = fakeResponse();
    await handler(fakeRequest('PATCH', { uid: 'uid-2', rol: 'admin' }), res as never);

    expect(res.statusCode).toBe(200);
    // rol no cambió → no setCustomUserClaims
    expect(mocks.setCustomUserClaims).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/usuarios — rama último superadmin', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSuperadmin.mockResolvedValue({
      uid: 'admin-1',
      rol: 'superadmin',
    });
  });

  it('último superadmin: no permite deshabilitar', async () => {
    const snap = {
      exists: true,
      data: () => ({ rol: 'superadmin' }),
    };
    mocks.collection.mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(snap),
        set: vi.fn().mockResolvedValue(undefined),
      }),
      where: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ size: 1 }),
      }),
    });

    const res = fakeResponse();
    await handler(fakeRequest('DELETE', { uid: 'uid-2' }), res as never);
    expect(res.statusCode).toBe(400);
  });
});

describe('Handler — rama de error 500', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSuperadmin.mockRejectedValue(new Error('Fallo inesperado'));
  });

  it('retorna 500 cuando requireSuperadmin lanza error sin status', async () => {
    const res = fakeResponse();
    await handler(fakeRequest('GET'), res as never);
    expect(res.statusCode).toBe(500);
  });

  it('retorna 500 cuando un handler lanza error inesperado', async () => {
    mocks.requireSuperadmin.mockResolvedValue({
      uid: 'admin-1',
      rol: 'superadmin',
    });
    mocks.collection.mockReturnValue({
      get: vi.fn().mockRejectedValue(new Error('Firestore caído')),
    });

    const res = fakeResponse();
    await handler(fakeRequest('GET'), res as never);
    expect(res.statusCode).toBe(500);
  });
});

describe('DELETE /api/usuarios — rama sin uid', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSuperadmin.mockResolvedValue({
      uid: 'admin-1',
      rol: 'superadmin',
    });
  });

  it('retorna 400 si falta el uid en DELETE', async () => {
    const res = fakeResponse();
    await handler(fakeRequest('DELETE', {}), res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe('El uid es requerido.');
  });

  it('retorna 400 si falta el uid en PATCH', async () => {
    const res = fakeResponse();
    await handler(fakeRequest('PATCH', {}), res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe('El uid es requerido.');
  });

  it('PATCH actualiza estado de usuario', async () => {
    const snap = {
      exists: true,
      data: () => ({ rol: 'admin', nombre: 'Usuario' }),
    };
    mocks.collection.mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(snap),
        set: vi.fn().mockResolvedValue(undefined),
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ size: 2 }),
        }),
      }),
    });

    const res = fakeResponse();
    await handler(
      fakeRequest('PATCH', { uid: 'uid-2', estado: 'deshabilitado' }),
      res as never,
    );

    expect(res.statusCode).toBe(200);
  });
});

describe('Autenticación y método no permitido', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('retorna 403 cuando requireSuperadmin falla', async () => {
    const error = new Error('Forbidden') as Error & { status?: number };
    error.status = 403;
    mocks.requireSuperadmin.mockRejectedValue(error);

    const res = fakeResponse();
    await handler(fakeRequest('GET'), res as never);
    expect(res.statusCode).toBe(403);
  });

  it('retorna 405 para método no permitido', async () => {
    mocks.requireSuperadmin.mockResolvedValue({
      uid: 'admin-1',
      rol: 'superadmin',
    });
    const res = fakeResponse();
    await handler(fakeRequest('PUT'), res as never);
    expect(res.statusCode).toBe(405);
  });
});
