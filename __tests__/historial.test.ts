/**
 * Pruebas de las utilidades puras del historial de preguntas.
 *
 * Lo más importante: las imágenes `data:` URL nunca se guardan completas y el
 * diff solo incluye campos de contenido que realmente cambiaron.
 */

import { describe, expect, it } from 'vitest';
import {
  calcularCambios,
  construirEvento,
  normalizarEvento,
  resumirCambios,
  sanitizarImagenes,
  sanitizarUrlImagen,
  snapshotPregunta,
  valorHistorial,
} from '@/lib/historial';

const DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lC7qNwAAAABJRU5ErkJggg==';

describe('sanitizarUrlImagen', () => {
  it('marca las URLs ausentes o vacías', () => {
    expect(sanitizarUrlImagen(null)).toEqual({
      tipo: 'sin_url',
      bytes: null,
      url: null,
    });
    expect(sanitizarUrlImagen('   ')).toEqual({
      tipo: 'sin_url',
      bytes: null,
      url: null,
    });
  });

  it('reduce una data URL a metadatos sin conservar el contenido', () => {
    const ref = sanitizarUrlImagen(DATA_URL);
    expect(ref.tipo).toBe('data_url');
    expect(ref.url).toBeNull();
    expect(ref.bytes).toBeGreaterThan(0);
    expect(JSON.stringify(ref)).not.toContain('iVBORw0KGgo');
  });

  it('conserva URLs externas y relativas', () => {
    expect(sanitizarUrlImagen('https://host/x.png')).toEqual({
      tipo: 'url_externa',
      bytes: null,
      url: 'https://host/x.png',
    });
    expect(sanitizarUrlImagen('/images/x.png')).toEqual({
      tipo: 'otra',
      bytes: null,
      url: '/images/x.png',
    });
    expect(sanitizarUrlImagen('ftp://host/x.png')).toEqual({
      tipo: 'otra',
      bytes: null,
      url: null,
    });
  });
});

describe('sanitizarImagenes', () => {
  it('devuelve lista vacía si el valor no es un arreglo', () => {
    expect(sanitizarImagenes('no-lista')).toEqual([]);
    expect(sanitizarImagenes(null)).toEqual([]);
  });

  it('normaliza rol, orden, alt, path y sha256', () => {
    const imagenes = sanitizarImagenes([
      {
        url: 'https://host/x.png',
        rol: 'contexto',
        orden: 2,
        alt: ' Figura ',
        path_origen: ' banco/x.png ',
        sha256: ' abc123 ',
      },
      'no-objeto',
      { url: DATA_URL },
    ]);

    expect(imagenes).toHaveLength(2);
    expect(imagenes[0]).toMatchObject({
      rol: 'contexto',
      orden: 2,
      alt: 'Figura',
      path_origen: 'banco/x.png',
      sha256: 'abc123',
      tipo: 'url_externa',
      url: 'https://host/x.png',
    });
    expect(imagenes[1]).toMatchObject({
      rol: 'pregunta',
      orden: 3,
      tipo: 'data_url',
      url: null,
    });
  });
});

describe('valorHistorial', () => {
  it('normaliza opciones, contexto_ids y campos especiales', () => {
    expect(valorHistorial('opciones', ['a', 'b'])).toEqual({
      A: 'a',
      B: 'b',
      C: '',
      D: '',
    });
    expect(valorHistorial('contexto_ids', ['C1', '', 2])).toEqual(['C1']);
    expect(valorHistorial('contexto_ids', 'no-lista')).toEqual([]);
    expect(valorHistorial('numero', 3)).toBe(3);
    expect(valorHistorial('numero', '3')).toBeNull();
    expect(valorHistorial('respuesta_correcta', ' b ')).toBe('B');
    expect(valorHistorial('respuesta_correcta', '')).toBeNull();
    expect(valorHistorial('estado', ' APROBADO ')).toBe('aprobado');
    expect(valorHistorial('dificultad', ' ALTA ')).toBe('alta');
    expect(valorHistorial('verificada', 'true')).toBe(false);
    expect(valorHistorial('verificada', true)).toBe(true);
    expect(valorHistorial('pregunta', '  Hola  ')).toBe('Hola');
    expect(valorHistorial('pregunta', null)).toBeNull();
    expect(valorHistorial('campo_desconocido', undefined)).toBeNull();
  });
});

describe('snapshotPregunta', () => {
  it('incluye contenido y metadatos de imagen sin el data URL completo', () => {
    const snapshot = snapshotPregunta({
      pregunta: '¿Cuánto es 2 + 2?',
      opciones: { A: '4', B: '3', C: '2', D: '1' },
      respuesta_correcta: 'a',
      estado: 'pendiente',
      imagenes: [{ url: DATA_URL, rol: 'pregunta', orden: 1 }],
    });

    expect(snapshot['pregunta']).toBe('¿Cuánto es 2 + 2?');
    expect(snapshot['respuesta_correcta']).toBe('A');
    expect(snapshot['estado']).toBe('pendiente');
    expect(JSON.stringify(snapshot)).not.toContain('iVBORw0KGgo');
    expect(snapshot['imagenes']).toEqual([
      expect.objectContaining({ tipo: 'data_url', url: null }),
    ]);
  });
});

describe('calcularCambios', () => {
  it('no reporta cambios cuando los valores son equivalentes', () => {
    const antes = {
      pregunta: 'Hola',
      opciones: { A: '1', B: '2', C: '3', D: '4' },
      estado: 'pendiente',
    };
    expect(calcularCambios(antes, { ...antes, pregunta: ' Hola ' })).toEqual({});
  });

  it('reporta solo los campos que cambiaron', () => {
    const antes = {
      pregunta: 'Hola',
      explicacion: 'Explicación',
      opciones: { A: '1', B: '2', C: '3', D: '4' },
      imagenes: [],
    };
    const despues = {
      ...antes,
      pregunta: 'Hola mundo',
      opciones: { A: '1', B: '2', C: '3', D: '5' },
      imagenes: [{ url: DATA_URL, rol: 'pregunta', orden: 1 }],
    };
    const cambios = calcularCambios(antes, despues);
    expect(Object.keys(cambios).sort()).toEqual(['imagenes', 'opciones', 'pregunta']);
    expect(cambios['pregunta']).toEqual({
      antes: 'Hola',
      despues: 'Hola mundo',
    });
    expect(JSON.stringify(cambios['imagenes'])).not.toContain('iVBORw0KGgo');
  });
});

describe('resumirCambios', () => {
  const cambio = { antes: 'a', despues: 'b' };

  it('resume creación, importación y deshabilitación', () => {
    expect(resumirCambios('creacion', {})).toBe('Pregunta creada en el banco.');
    expect(resumirCambios('importacion', {})).toBe('Pregunta importada.');
    expect(resumirCambios('importacion', {}, { archivo: 'lote.jsonl' })).toBe(
      'Pregunta importada desde lote.jsonl.',
    );
    expect(resumirCambios('deshabilitacion', {})).toBe(
      'Pregunta deshabilitada (borrado lógico).',
    );
    expect(resumirCambios('deshabilitacion', {}, { motivo: 'Duplicada' })).toBe(
      'Pregunta deshabilitada: Duplicada',
    );
  });

  it('resume revisiones y ediciones', () => {
    expect(resumirCambios('revision', {}, { estado: 'aprobado' })).toBe(
      'Revisión aplicada: estado "aprobado".',
    );
    expect(resumirCambios('revision', { estado: cambio })).toBe(
      'Revisión aplicada: estado "b".',
    );
    expect(resumirCambios('revision', {})).toBe('Revisión registrada.');
    expect(resumirCambios('edicion', {})).toBe('Guardado sin cambios de contenido.');
    expect(resumirCambios('edicion', { pregunta: cambio })).toBe(
      'Se actualizó Enunciado.',
    );
    expect(resumirCambios('edicion', { pregunta: cambio, explicacion: cambio })).toBe(
      'Se actualizaron: Enunciado, Explicación.',
    );
    expect(
      resumirCambios('edicion', {
        pregunta: cambio,
        explicacion: cambio,
        imagenes: cambio,
        opciones: cambio,
      }),
    ).toBe('Se actualizaron 4 campos: Enunciado, Explicación, Imágenes…');
  });
});

describe('construirEvento', () => {
  it('usa el autor autenticado y vincula el reporte', () => {
    const evento = construirEvento({
      preguntaId: 'T1-P01',
      actorUid: 'uid-1',
      actorNombre: '  Ana  ',
      actorRol: 'admin',
      accion: 'edicion',
      reporteId: 'rep-1',
      cambios: { pregunta: { antes: 'a', despues: 'b' } },
      fecha: '2026-11-09T12:00:00.000Z',
    });

    expect(evento).toMatchObject({
      preguntaId: 'T1-P01',
      actorUid: 'uid-1',
      actorNombre: 'Ana',
      actorRol: 'admin',
      accion: 'edicion',
      origen: 'reporte',
      reporteId: 'rep-1',
      campos: ['pregunta'],
      fecha: '2026-11-09T12:00:00.000Z',
      fechaMs: Date.parse('2026-11-09T12:00:00.000Z'),
    });
    expect(evento.resumen).toBe('Se actualizó Enunciado.');
  });

  it('usa valores por defecto para autor y origen', () => {
    const evento = construirEvento({
      preguntaId: 'P1',
      actorUid: '',
      accion: 'creacion',
    });
    expect(evento.origen).toBe('panel');
    expect(evento.actorNombre).toBe('admin-panel');
    expect(evento.actorRol).toBe('admin');
    expect(evento.reporteId).toBeNull();
  });
});

describe('normalizarEvento', () => {
  it('normaliza un documento completo', () => {
    const evento = normalizarEvento('evt-1', {
      preguntaId: 'T1-P01',
      fecha: '2026-11-09T12:00:00.000Z',
      fechaMs: Date.parse('2026-11-09T12:00:00.000Z'),
      actorUid: 'uid-1',
      actorNombre: 'Ana',
      actorRol: 'admin',
      accion: 'revision',
      origen: 'reporte',
      reporteId: 'rep-1',
      campos: ['estado'],
      resumen: 'Aprobada',
      cambios: { estado: { antes: 'pendiente', despues: 'aprobado' } },
      snapshot: { pregunta: 'Hola' },
    });

    expect(evento).toMatchObject({
      id: 'evt-1',
      preguntaId: 'T1-P01',
      accion: 'revision',
      origen: 'reporte',
      reporteId: 'rep-1',
      campos: ['estado'],
      resumen: 'Aprobada',
      snapshot: { pregunta: 'Hola' },
    });
    expect(evento.cambios['estado']).toEqual({
      antes: 'pendiente',
      despues: 'aprobado',
    });
  });

  it('tolera documentos incompletos o inválidos', () => {
    const evento = normalizarEvento('evt-2', {
      accion: 'desconocida',
      origen: 'otro',
      fechaMs: 'no-numero',
      campos: ['pregunta', 2],
      cambios: { pregunta: 'no-objeto', opciones: { antes: 'a' } },
    });

    expect(evento.accion).toBe('edicion');
    expect(evento.origen).toBe('panel');
    expect(evento.fechaMs).toBe(0);
    expect(evento.campos).toEqual(['pregunta']);
    expect(evento.cambios).toEqual({
      opciones: { antes: 'a', despues: null },
    });
    expect(evento.snapshot).toBeUndefined();
  });

  it('deriva fechaMs desde la fecha ISO y usa los cambios como campos', () => {
    const evento = normalizarEvento('evt-3', {
      fecha: '2026-11-09T12:00:00.000Z',
      cambios: { pregunta: { antes: 'a', despues: 'b' } },
    });
    expect(evento.fechaMs).toBe(Date.parse('2026-11-09T12:00:00.000Z'));
    expect(evento.campos).toEqual(['pregunta']);
  });
});
