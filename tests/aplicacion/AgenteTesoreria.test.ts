import { describe, it, expect, beforeEach } from 'vitest';
import { AgenteTesoreria } from '../../src/aplicacion/agentes/AgenteTesoreria.js';
import {
  RepositorioCuentasEnMemoria,
  RepositorioTransaccionesEnMemoria,
  RepositorioPlanesCuotasEnMemoria
} from '../mocks/RepositoriosEnMemoria.js';

describe('Agente 3: AgenteTesoreria (Safe-to-Spend y Proyecciones)', () => {
  let repoCuentas: RepositorioCuentasEnMemoria;
  let repoTx: RepositorioTransaccionesEnMemoria;
  let repoCuotas: RepositorioPlanesCuotasEnMemoria;
  let agente: AgenteTesoreria;

  beforeEach(async () => {
    repoCuentas = new RepositorioCuentasEnMemoria();
    repoTx = new RepositorioTransaccionesEnMemoria();
    repoCuotas = new RepositorioPlanesCuotasEnMemoria();

    await repoCuentas.guardar({
      id: 'cta-ars',
      nombre: 'Banco del Chaco',
      tipo_cuenta: 'CAJA_AHORRO',
      moneda: 'ARS',
      saldo_actual: 1200000,
      identificadores_cuenta: {}
    });

    await repoCuentas.guardar({
      id: 'cta-usd',
      nombre: 'Santander USD',
      tipo_cuenta: 'CAJA_AHORRO',
      moneda: 'USD',
      saldo_actual: 1500,
      identificadores_cuenta: {}
    });

    agente = new AgenteTesoreria(repoCuentas, repoTx, repoCuotas);
  });

  it('debe calcular el estado consolidado de tesorería y Safe-to-Spend diario', async () => {
    const config = {
      reservaContingenciaMinima: 200000,
      diaCobroIngresoMensual: 5,
      ingresoBaseEstimadoMensual: 1000000
    };

    // Fecha simulada: 20 de septiembre (faltan 15 días para el 5 de octubre)
    const fechaSimulada = new Date(2026, 8, 20);

    const estado = await agente.obtenerEstadoConsolidado(config, fechaSimulada);

    expect(estado.totalLiquidezARS).toBe(1200000);
    expect(estado.totalReservaUSD).toBe(1500);
    expect(estado.safeToSpend.alertaDeficit).toBe(false);
    expect(estado.safeToSpend.safeToSpendDiario).toBeGreaterThan(0);
  });

  it('debe alertar desahorro si se registran ventas de divisas en el período', async () => {
    // Registrar una venta de USD tipificada como RESCATE_DESAHORRO
    await repoTx.guardar({
      id: 'tx-rescate-1',
      id_miembro_familia: 'titular',
      fecha_transaccion: new Date(),
      monto: 300000,
      moneda: 'ARS',
      tipo_transaccion: 'RESCATE_DESAHORRO',
      nivel_rigidez: 'INFLEXIBLE',
      categoria: 'Rescate de Capital',
      comercio: 'Venta USD',
      estado: 'CONFIRMADO'
    });

    const config = {
      reservaContingenciaMinima: 100000,
      diaCobroIngresoMensual: 1,
      ingresoBaseEstimadoMensual: 1000000
    };

    const estado = await agente.obtenerEstadoConsolidado(config);

    expect(estado.totalDesahorroMesActual).toBe(300000);
  });
});
