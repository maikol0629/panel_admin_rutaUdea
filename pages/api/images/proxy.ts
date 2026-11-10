/**
 * /api/images/proxy
 *
 * Proxy para imágenes externas con headers CORS.
 *
 * Permite cargar imágenes desde servidores que no permiten CORS
 * directamente desde el navegador. El panel admin usa esto para
 * editar imágenes de preguntas almacenadas en Firebase Storage u otros
 * servidores externos.
 *
 * Query params:
 *   url: URL de la imagen externa a descargar (obligatorio)
 */

import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  // Headers CORS para permitir acceso desde cualquier origen
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // Sin caché: evita que una respuesta antigua/incorrecta quede fijada en el navegador.
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'El parámetro "url" es requerido.' });
    return;
  }

  let urlExterna: URL;
  try {
    urlExterna = new URL(url);
  } catch {
    res.status(400).json({ error: 'El parámetro "url" no es una URL válida.' });
    return;
  }
  if (!['http:', 'https:'].includes(urlExterna.protocol)) {
    res.status(400).json({ error: 'La URL debe usar http o https.' });
    return;
  }

  try {
    const respuesta = await fetch(urlExterna, {
      headers: { Accept: 'image/*' },
    });

    if (!respuesta.ok) {
      res.status(respuesta.status).json({
        error: `No se pudo descargar la imagen (${respuesta.status}): ${respuesta.statusText}`,
      });
      return;
    }

    const contenidoTipo =
      respuesta.headers.get('content-type') ?? 'application/octet-stream';
    if (!contenidoTipo.startsWith('image/')) {
      res.status(415).json({ error: 'La URL no apunta a un archivo de imagen.' });
      return;
    }

    const buffer = Buffer.from(await respuesta.arrayBuffer());
    // Enviar binario real: res.send(Buffer) evita la serialización JSON
    // que Next.js aplica a Uint8Array y que rompe la imagen.
    res.setHeader('Content-Type', contenidoTipo);
    res.setHeader('Content-Length', String(buffer.length));
    res.status(200).send(buffer);
  } catch (error) {
    console.error('Error en /api/images/proxy:', error);
    res.status(500).json({
      error: 'Error interno al descargar la imagen.',
    });
  }
}
