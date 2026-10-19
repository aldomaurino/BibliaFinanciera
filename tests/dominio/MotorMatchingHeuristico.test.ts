import { describe, it, expect } from 'vitest';
import { MotorMatchingHeuristico, LineaExtractoOficial } from '../../src/dominio/servicios/MotorMatchingHeuristico.js';
import { Transaccion } from '../../src/dominio/modelos/Transaccion.js';

describe('Servicio de Dominio: MotorMatchingHeuristico', () => {
  it('debe confirmar coincidencia (Score >= 0.85) ante montos idénticos, comercios similares y ventana temporal corta', () => {
    // Transacción cargada en T+0 por el usuario por voz/texto
    const provisoria: Transaccion = {
      id: 'tx-1',
      id_miembro_familia: 'titular',
      fecha_transaccion: new Date('2026-09-15T14:30:00Z'),
      monto: 18500,
      moneda: 'ARS',
      tipo_transaccion: 'GASTO',
      nivel_rigidez: 'OPERATIVO_ELASTICO',
      categoria: 'Combustible',
      comercio: 'YPF Estacion 44',
      estado: 'PROVISORIO'
    };

    // Línea que viene 2 días después en el extracto del banco
    const extracto: LineaExtractoOficial = {
      fecha: new Date('2026-09-17T03:00:00Z'), // 2 días de diferimiento
      monto: 18500,
      comercio_crudo: 'MP*YPF ESTACION 44',
      ultimos_cuatro_digitos: '4589'
    };

    const resultado = MotorMatchingHeuristico.evaluarCoincidencia(provisoria, extracto, '4589');

    expect(resultado.esCoincidenciaConfirmada).toBe(true);
    expect(resultado.puntajeCoincidencia).toBeGreaterThanOrEqual(0.85);
    expect(resultado.detallesPuntaje.puntajeMonto).toBe(1.0);
  });

  it('debe rechazar coincidencia si el monto difiere significativamente', () => {
    const provisoria: Transaccion = {
      id: 'tx-1',
      id_miembro_familia: 'titular',
      fecha_transaccion: new Date('2026-09-15T14:30:00Z'),
      monto: 18500,
      moneda: 'ARS',
      tipo_transaccion: 'GASTO',
      nivel_rigidez: 'OPERATIVO_ELASTICO',
      categoria: 'Combustible',
      comercio: 'YPF',
      estado: 'PROVISORIO'
    };

    const extracto: LineaExtractoOficial = {
      fecha: new Date('2026-09-15T14:30:00Z'),
      monto: 54000, // Monto diferente
      comercio_crudo: 'YPF',
      ultimos_cuatro_digitos: '4589'
    };

    const resultado = MotorMatchingHeuristico.evaluarCoincidencia(provisoria, extracto, '4589');

    expect(resultado.esCoincidenciaConfirmada).toBe(false);
    expect(resultado.puntajeCoincidencia).toBeLessThan(0.85);
  });

  it('debe encontrar la mejor coincidencia en un conjunto de transacciones provisorias', () => {
    const provisorias: Transaccion[] = [
      {
        id: 'tx-farmacia',
        id_miembro_familia: 'hija-1',
        fecha_transaccion: new Date('2026-09-10'),
        monto: 7200,
        moneda: 'ARS',
        tipo_transaccion: 'GASTO',
        nivel_rigidez: 'INFLEXIBLE',
        categoria: 'Salud',
        comercio: 'Farmacia San Martin',
        estado: 'PROVISORIO'
      },
      {
        id: 'tx-super',
        id_miembro_familia: 'conyuge',
        fecha_transaccion: new Date('2026-09-11'),
        monto: 34500,
        moneda: 'ARS',
        tipo_transaccion: 'GASTO',
        nivel_rigidez: 'OPERATIVO_ELASTICO',
        categoria: 'Supermercado',
        comercio: 'Carrefour Market',
        estado: 'PROVISORIO'
      }
    ];

    const linea: LineaExtractoOficial = {
      fecha: new Date('2026-09-12'),
      monto: 34500,
      comercio_crudo: 'INC SA CARREFOUR EXPRESS',
      ultimos_cuatro_digitos: '1234'
    };

    const mapaTarjetas = new Map<string, string>();
    const mejor = MotorMatchingHeuristico.buscarMejorCoincidencia(provisorias, linea, mapaTarjetas);

    expect(mejor).not.toBeNull();
    expect(mejor?.transaccionProvisoriaOriginal?.id).toBe('tx-super');
  });
});
