/**
 * Pruebas de la API /api/images/proxy.
 *
 * - Descarga imágenes externas y las sirve con headers CORS.
 * - Rechaza solicitudes sin parámetro url.
 * - Maneja errores de descarga.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

vi.mock('next/headers', () => ({}));

vi.stubGlobal('fetch', fetchMock);

import handler from '../pages/api/images/proxy';

interface FakeResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status: (code: number) => FakeResponse;
  json: (body: unknown) => FakeResponse;
  setHeader: (name: string, value: string) => FakeResponse;
  send: (body: unknown) => FakeResponse;
  end: () => FakeResponse;
}

function fakeResponse(): FakeResponse {
  const res = {
    statusCode: 200,
    body: null,
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
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    send(body: unknown) {
      res.body = body;
      return res;
    },
    end() {
      return res;
    },
  };
  return res as unknown as FakeResponse;
}

function fakeRequest(method: string, query: Record<string, string> = {}) {
  return {
    method,
    query,
    headers: {},
  } as never;
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('GET /api/images/proxy', () => {
  it('descarga una imagen externa y la sirve con headers CORS', async () => {
    const buffer = Buffer.from('datos-de-imagen-falsa');
    fetchMock.mockResolvedValue(
      new Response(buffer, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    );

    const res = fakeResponse();
    await handler(
      fakeRequest('GET', { url: 'https://ejemplo.com/imagen.png' }),
      res as never,
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['content-type']).toBe('image/png');
    expect(fetchMock).toHaveBeenCalledWith(new URL('https://ejemplo.com/imagen.png'), {
      headers: { Accept: 'image/*' },
    });
  });

  it('devuelve 400 si falta el parámetro url', async () => {
    const res = fakeResponse();
    await handler(fakeRequest('GET', {}), res as never);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error?: string })?.error).toContain('url');
  });

  it('devuelve 405 para métodos no permitidos', async () => {
    const res = fakeResponse();
    await handler(
      fakeRequest('POST', { url: 'https://ejemplo.com/imagen.png' }),
      res as never,
    );

    expect(res.statusCode).toBe(405);
  });

  it('maneja errores de descarga de la imagen', async () => {
    fetchMock.mockRejectedValue(new Error('Error de red'));

    const res = fakeResponse();
    await handler(
      fakeRequest('GET', { url: 'https://ejemplo.com/imagen.png' }),
      res as never,
    );

    expect(res.statusCode).toBe(500);
  });
});

describe('OPTIONS /api/images/proxy', () => {
  it('responde 200 para preflight CORS', async () => {
    const res = fakeResponse();
    await handler(
      fakeRequest('OPTIONS', { url: 'https://ejemplo.com/imagen.png' }),
      res as never,
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});
