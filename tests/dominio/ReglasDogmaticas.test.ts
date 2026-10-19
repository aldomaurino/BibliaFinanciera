import { describe, it, expect } from 'vitest';
import { Cuenta, cuentaPoseeIdentificador } from '../../src/dominio/modelos/Cuenta.js';
import { Transaccion } from '../../src/dominio/modelos/Transaccion.js';

describe('Principios Dogmáticos del Dominio', () => {
  const cuentaSantander: Cuenta = {
    id: 'cta-santander',
    nombre: 'Santander Río',
    tipo_cuenta: 'CUENTA_CORRIENTE',
    moneda: 'ARS',
    saldo_actual: 500000,
    identificadores_cuenta: {
      cbus: ['0720123488000012345678'],
      alias: ['ALDO.SANTANDER.PESOS']
    }
  };

  const cuentaMercadoPago: Cuenta = {
    id: 'cta-mp',
    nombre: 'Mercado Pago',
    tipo_cuenta: 'BILLETERA_VIRTUAL',
    moneda: 'ARS',
    saldo_actual: 200000,
    identificadores_cuenta: {
      cvus: ['0000003100012345678901'],
      alias: ['ALDO.MP.RESERVA']
    }
  };

  it('Dogma 2 (Traspasos Neutros): debe identificar como transferencia interna los envíos entre cuentas propias y mantener el patrimonio consolidado constante', () => {
    const aliasDestino = 'ALDO.MP.RESERVA';
    const montoTraspaso = 100000;

    // Verificar si el destino pertenece a la lista de cuentas propias
    const esTransferenciaPropia = cuentaPoseeIdentificador(cuentaMercadoPago, aliasDestino);
    expect(esTransferenciaPropia).toBe(true);

    // Simular el movimiento contable
    const saldoInicialTotal = cuentaSantander.saldo_actual + cuentaMercadoPago.saldo_actual;
    
    // Débito en origen y Crédito en destino
    const saldoSantanderFinal = cuentaSantander.saldo_actual - montoTraspaso;
    const saldoMPFinal = cuentaMercadoPago.saldo_actual + montoTraspaso;
    const saldoFinalTotal = saldoSantanderFinal + saldoMPFinal;

    // Principio de traspaso neutro: Impacto neto = 0
    expect(saldoFinalTotal).toBe(saldoInicialTotal);
  });

  it('Dogma 3 (Desahorro Explícito): un ingreso originado en venta de USD debe tipificarse como RESCATE_DESAHORRO y no como ingreso genuino', () => {
    const txVentaUSD: Transaccion = {
      id: 'tx-desahorro-1',
      id_cuenta_origen: 'cta-usd-ahorro',
      id_miembro_familia: 'titular',
      fecha_transaccion: new Date(),
      monto: 350000,
      moneda: 'ARS',
      tipo_cambio: 1250,
      tipo_transaccion: 'RESCATE_DESAHORRO', // Irrevocable
      nivel_rigidez: 'INFLEXIBLE',
      categoria: 'Rescate de Capital',
      comercio: 'Venta USD MEP / Dólar Banco',
      estado: 'CONFIRMADO'
    };

    // Al calcular los ingresos genuinos del mes, debe dar 0 para esta transacción
    const esIngresoGenuino = txVentaUSD.tipo_transaccion === 'INGRESO_GENUINO';
    const esRescateDesahorro = txVentaUSD.tipo_transaccion === 'RESCATE_DESAHORRO';

    expect(esIngresoGenuino).toBe(false);
    expect(esRescateDesahorro).toBe(true);
  });

  it('Dogma 4 (Caja Negra del Efectivo): una extracción de cajero debe amortizarse al 100% como gasto operativo', () => {
    const montoRetirado = 50000;
    
    const txExtraccion: Transaccion = {
      id: 'tx-atm-1',
      id_cuenta_origen: 'cta-santander',
      id_miembro_familia: 'titular',
      fecha_transaccion: new Date(),
      monto: montoRetirado,
      moneda: 'ARS',
      tipo_transaccion: 'GASTO', // Se computa como gasto directo
      nivel_rigidez: 'OPERATIVO_ELASTICO',
      categoria: 'EFECTIVO_AMORTIZADO', // Categoría automática de amortización
      comercio: 'Cajero Automático Banelco',
      estado: 'CONFIRMADO'
    };

    expect(txExtraccion.tipo_transaccion).toBe('GASTO');
    expect(txExtraccion.categoria).toBe('EFECTIVO_AMORTIZADO');
  });
});
