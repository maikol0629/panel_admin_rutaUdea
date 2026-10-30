/**
 * Tests del contrato v2 del panel (`lib/bank.ts`).
 *
 * Cubren lo que decide si una pregunta puede publicarse: normalización,
 * taxonomía RL01–RL18 / CL01–CL14, opciones objeto/lista, imágenes con
 * rol, verificación y validación del lote.
 */

import { describe, expect, it } from 'vitest';
import {
  aLista,
  esComponenteValido,
  faltantesParaPublicar,
  normalizarImagenes,
  normalizarOpciones,
  normalizarPregunta,
  resumenBanco,
  validarLoteParaPublicar,
} from '../lib/bank';

function docValido(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    ...extra,
  };
}

describe('normalización', () => {
  it('acepta opciones como objeto y como lista', () => {
    const objeto = normalizarOpciones({ A: '1', B: '2', C: '3', D: '4' });
    expect(aLista(objeto)).toEqual(['1', '2', '3', '4']);

    const lista = normalizarOpciones(['1', '2', '3', '4']);
    expect(aLista(lista)).toEqual(['1', '2', '3', '4']);
  });

  it('normaliza imágenes con rol, orden y alt', () => {
    const imagenes = normalizarImagenes([
      { url: 'https://host/contexto.png', rol: 'contexto', orden: 1, alt: 'Tabla' },
      { url: 'https://host/pregunta.png', rol: 'pregunta' },
      { rol: 'contexto' },
      'no-es-objeto',
    ]);
    expect(imagenes).toHaveLength(3);
    expect(imagenes[0]?.rol).toBe('contexto');
    expect(imagenes[1]?.orden).toBe(2);
    expect(imagenes[2]?.url).toBeNull();
  });

  it('un documento sin estado entra como pendiente (D-08)', () => {
    const p = normalizarPregunta('T1-P01', docValido({ estado: undefined }));
    expect(p.estado).toBe('pendiente');
  });

  it('conserva contexto_ids y metadatos de revisión', () => {
    const p = normalizarPregunta(
      'T2-P01',
      docValido({ contexto_ids: ['T2-C01'], revisado_por: 'Michael', tarea: 'T2' }),
    );
    expect(p.contexto_ids).toEqual(['T2-C01']);
    expect(p.revisado_por).toBe('Michael');
    expect(p.tarea).toBe('T2');
  });
});

describe('taxonomía oficial', () => {
  it('acepta RL01–RL18 y CL01–CL14', () => {
    expect(esComponenteValido('RL01 Porcentajes')).toBe(true);
    expect(esComponenteValido('RL16 Probabilidad')).toBe(true);
    expect(esComponenteValido('RL18 Algo nuevo')).toBe(true);
    expect(esComponenteValido('CL14 Algo nuevo')).toBe(true);
  });

  it('rechaza fuera de taxonomía', () => {
    expect(esComponenteValido('RL19 Inventado')).toBe(false);
    expect(esComponenteValido('CL15 Inventado')).toBe(false);
    expect(esComponenteValido('Proporcionalidad')).toBe(false);
  });
});

describe('validación para publicar', () => {
  it('una pregunta completa no tiene faltantes', () => {
    const p = normalizarPregunta('T1-P01', docValido());
    expect(faltantesParaPublicar(p)).toEqual([]);
  });

  it('detecta opciones vacías, respuesta y verificación', () => {
    const p = normalizarPregunta(
      'T1-P01',
      docValido({
        opciones: { A: '10', B: '', C: '30', D: '40' },
        respuesta_correcta: null,
        verificada: false,
      }),
    );
    const faltantes = faltantesParaPublicar(p);
    expect(faltantes).toContain('opcion_b');
    expect(faltantes).toContain('respuesta_correcta');
    expect(faltantes).toContain('verificada');
  });

  it('exige imagen con URL cuando la requiere', () => {
    const p = normalizarPregunta(
      'T2-P01',
      docValido({ estado: 'aprobado_con_imagen', requiere_imagen: true, imagenes: [] }),
    );
    expect(faltantesParaPublicar(p)).toContain('imagen');
  });

  it('detecta subtema fuera de taxonomía', () => {
    const p = normalizarPregunta('T1-P01', docValido({ subtema: 'Porcentajes' }));
    expect(faltantesParaPublicar(p).some((f) => f.startsWith('subtema_taxonomia'))).toBe(true);
  });

  it('valida el lote completo y reporta versión distinta', () => {
    const buenas = [
      normalizarPregunta('T1-P01', docValido()),
      normalizarPregunta('T1-P02', docValido({ subtema: 'RL03 Regla de tres' })),
    ];
    expect(validarLoteParaPublicar(buenas, 'udea-2026-10-v1')).toEqual([]);

    const otra = normalizarPregunta(
      'T1-P03',
      docValido({ bank_version: 'udea-2026-09-v1' }),
    );
    const motivos = validarLoteParaPublicar([...buenas, otra], 'udea-2026-10-v1');
    expect(motivos.some((m) => m.startsWith('version_distinta:T1-P03'))).toBe(true);
  });

  it('rechaza un lote sin aprobadas', () => {
    const pendiente = normalizarPregunta(
      'T1-P01',
      docValido({ estado: 'pendiente' }),
    );
    expect(validarLoteParaPublicar([pendiente], 'udea-2026-10-v1')).toContain(
      'no_hay_preguntas_aprobadas',
    );
  });
});

describe('resumen del banco', () => {
  it('cuenta estados, áreas, imágenes y opciones en imagen', () => {
    const preguntas = [
      normalizarPregunta('T1-P01', docValido()),
      normalizarPregunta(
        'T2-P01',
        docValido({
          estado: 'aprobado_con_imagen',
          area: 'competencia_lectora',
          subtema: 'CL01 Idea principal',
          imagenes: [{ url: 'https://host/x.png', rol: 'contexto', orden: 1 }],
          requiere_imagen: true,
        }),
      ),
      normalizarPregunta('T1-P03', docValido({ estado: 'pendiente' })),
      normalizarPregunta(
        'T1-P04',
        docValido({ estado: 'deshabilitado', opciones_en_imagen: true }),
      ),
    ];
    const r = resumenBanco(preguntas);
    expect(r.total).toBe(4);
    expect(r.aprobadas).toBe(2);
    expect(r.aprobado).toBe(1);
    expect(r.aprobado_con_imagen).toBe(1);
    expect(r.pendiente).toBe(1);
    expect(r.deshabilitado).toBe(1);
    expect(r.razonamiento_logico).toBe(3);
    expect(r.competencia_lectora).toBe(1);
    expect(r.conImagen).toBe(1);
    expect(r.opcionesEnImagen).toBe(1);
  });
});
