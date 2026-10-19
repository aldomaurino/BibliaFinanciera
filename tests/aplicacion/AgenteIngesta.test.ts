import { describe, it, expect } from 'vitest';
import { AgenteIngesta } from '../../src/aplicacion/agentes/AgenteIngesta.js';

describe('Agente 1: AgenteIngesta (NLP y Normalizador)', () => {
  it('debe parsear un gasto al vuelo simple de nafta', () => {
    const input = '18500 nafta santander';
    const resultado = AgenteIngesta.parsearTexto(input);

    expect(resultado.accion_detectada).toBe('GASTO_UNICO');
    expect(resultado.monto).toBe(18500);
    expect(resultado.moneda).toBe('ARS');
    expect(resultado.categoria_inferida).toBe('Combustible');
    expect(resultado.rigidez_inferida).toBe('OPERATIVO_ELASTICO');
  });

  it('debe detectar una compra en cuotas con tarjeta', () => {
    const input = '35000 farmacia visa en 3 cuotas';
    const resultado = AgenteIngesta.parsearTexto(input);

    expect(resultado.accion_detectada).toBe('COMPRA_EN_CUOTAS');
    expect(resultado.monto).toBe(35000);
    expect(resultado.cantidad_cuotas).toBe(3);
    expect(resultado.medio_pago).toBe('TARJETA_CREDITO');
    expect(resultado.categoria_inferida).toBe('Salud y Farmacia');
    expect(resultado.rigidez_inferida).toBe('INFLEXIBLE');
  });

  it('debe clasificar una extracción en cajero para amortización inmediata', () => {
    const input = 'extraccion cajero 40000';
    const resultado = AgenteIngesta.parsearTexto(input);

    expect(resultado.accion_detectada).toBe('EXTRACCION_CAJERO');
    expect(resultado.monto).toBe(40000);
    expect(resultado.medio_pago).toBe('EFECTIVO');
    expect(resultado.categoria_inferida).toBe('EFECTIVO_AMORTIZADO');
  });

  it('debe detectar una transferencia interna', () => {
    const input = 'transferencia a mercadopago 50000';
    const resultado = AgenteIngesta.parsearTexto(input);

    expect(resultado.accion_detectada).toBe('TRANSFERENCIA_INTERNA');
    expect(resultado.monto).toBe(50000);
    expect(resultado.medio_pago).toBe('TRANSFERENCIA');
  });

  it('debe detectar miembros de la familia por nombre propio (Aldo, Andrea, Chiara, Juli)', () => {
    expect(AgenteIngesta.parsearTexto('15000 farmacia andrea visa').indicio_miembro_familia).toBe('CONYUGE');
    expect(AgenteIngesta.parsearTexto('25000 libros chiara').indicio_miembro_familia).toBe('HIJA_2');
    expect(AgenteIngesta.parsearTexto('40000 cuota juli amex').indicio_miembro_familia).toBe('HIJA_1');
    expect(AgenteIngesta.parsearTexto('18500 nafta aldo').indicio_miembro_familia).toBe('TITULAR');
  });
});
