/**
 * Tests de la publicación del banco y del parser CSV.
 *
 * - `calcularHashLote` debe ser estable e ignorar preguntas no publicables.
 * - `parsearCSV` debe tolerar comas entre comillas y saltos de línea.
 */

import { describe, expect, it } from 'vitest';
import { calcularHashLote } from '../pages/api/bank/manifest';
import { parsearCSV } from '../pages/api/import/csv';
import { normalizarPregunta } from '../lib/bank';

function pregunta(id: string, estado: string, updatedAt = '2026-10-25T00:00:00Z') {
  return normalizarPregunta(id, {
    area: 'razonamiento_logico',
    subtema: 'RL02 Porcentajes',
    dificultad: 'media',
    pregunta: 'p',
    opciones: { A: '1', B: '2', C: '3', D: '4' },
    respuesta_correcta: 'A',
    estado,
    verificada: true,
    updated_at: updatedAt,
    bank_version: 'udea-2026-10-v1',
  });
}

describe('calcularHashLote', () => {
  it('es estable para el mismo lote', () => {
    const lote = [pregunta('T1-P01', 'aprobado'), pregunta('T1-P02', 'pendiente')];
    const a = calcularHashLote('udea-2026-10-v1', lote);
    const b = calcularHashLote('udea-2026-10-v1', [...lote].reverse());
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('cambia cuando cambia una pregunta publicable', () => {
    const original = calcularHashLote('udea-2026-10-v1', [
      pregunta('T1-P01', 'aprobado', '2026-10-25T00:00:00Z'),
    ]);
    const actualizado = calcularHashLote('udea-2026-10-v1', [
      pregunta('T1-P01', 'aprobado', '2026-10-26T00:00:00Z'),
    ]);
    expect(original).not.toBe(actualizado);
  });

  it('ignora preguntas pendientes o deshabilitadas', () => {
    const soloAprobada = calcularHashLote('udea-2026-10-v1', [
      pregunta('T1-P01', 'aprobado'),
    ]);
    const conPendiente = calcularHashLote('udea-2026-10-v1', [
      pregunta('T1-P01', 'aprobado'),
      pregunta('T1-P02', 'pendiente'),
    ]);
    expect(soloAprobada).toBe(conPendiente);
  });
});

describe('parsearCSV', () => {
  it('respeta comas y comillas dentro de campos', () => {
    const texto =
      'id,pregunta,explicacion\n' +
      'T1-P01,"¿Cuánto es 1,5 + 2?","Suma, con coma"\n' +
      'T1-P02,"Dice ""hola""","Otra"\n';
    const filas = parsearCSV(texto);
    expect(filas).toHaveLength(3);
    expect(filas[1]?.[1]).toBe('¿Cuánto es 1,5 + 2?');
    expect(filas[1]?.[2]).toBe('Suma, con coma');
    expect(filas[2]?.[1]).toBe('Dice "hola"');
  });

  it('soporta saltos de línea dentro de comillas', () => {
    const texto = 'id,texto\nT1-P01,"línea 1\nlínea 2"\n';
    const filas = parsearCSV(texto);
    expect(filas).toHaveLength(2);
    expect(filas[1]?.[1]).toBe('línea 1\nlínea 2');
  });
});
