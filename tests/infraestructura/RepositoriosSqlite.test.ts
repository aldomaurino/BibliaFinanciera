import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BovedaSqlite } from '../../src/infraestructura/persistencia/BovedaSqlite.js';
import { RepositorioCuentasSqlite } from '../../src/infraestructura/persistencia/RepositorioCuentasSqlite.js';
import { RepositorioTarjetasSqlite } from '../../src/infraestructura/persistencia/RepositorioTarjetasSqlite.js';
import { RepositorioMiembrosSqlite } from '../../src/infraestructura/persistencia/RepositorioMiembrosSqlite.js';
import { RepositorioTransaccionesSqlite } from '../../src/infraestructura/persistencia/RepositorioTransaccionesSqlite.js';
import { RepositorioPlanesCuotasSqlite } from '../../src/infraestructura/persistencia/RepositorioPlanesCuotasSqlite.js';
import { Cuenta } from '../../src/dominio/modelos/Cuenta.js';
import { TarjetaCredito } from '../../src/dominio/modelos/TarjetaCredito.js';
import { MiembroFamilia } from '../../src/dominio/modelos/MiembroFamilia.js';
import { Transaccion } from '../../src/dominio/modelos/Transaccion.js';
import { PlanCuotas, CronogramaCuota } from '../../src/dominio/modelos/PlanCuotas.js';

describe('Bóveda SQLite y Repositorios de Persistencia', () => {
  let boveda: BovedaSqlite;
  let repoCuentas: RepositorioCuentasSqlite;
  let repoTarjetas: RepositorioTarjetasSqlite;
  let repoMiembros: RepositorioMiembrosSqlite;
  let repoTransacciones: RepositorioTransaccionesSqlite;
  let repoPlanes: RepositorioPlanesCuotasSqlite;

  beforeEach(() => {
    boveda = new BovedaSqlite({ ruta: ':memory:' });
    boveda.conectar();
    repoCuentas = new RepositorioCuentasSqlite(boveda);
    repoTarjetas = new RepositorioTarjetasSqlite(boveda);
    repoMiembros = new RepositorioMiembrosSqlite(boveda);
    repoTransacciones = new RepositorioTransaccionesSqlite(boveda);
    repoPlanes = new RepositorioPlanesCuotasSqlite(boveda);
  });

  afterEach(() => {
    boveda.cerrar();
  });

  it('debe persistir, consultar y actualizar cuentas correctamente', async () => {
    const cuenta: Cuenta = {
      id: 'cta-1',
      nombre: 'Santander Río',
      tipo_cuenta: 'CUENTA_CORRIENTE',
      moneda: 'ARS',
      saldo_actual: 500000,
      identificadores_cuenta: {
        alias: ['aldo.santander.ars'],
        cbus: ['0720000000000000000001']
      }
    };

    await repoCuentas.guardar(cuenta);

    const obtenida = await repoCuentas.obtenerPorId('cta-1');
    expect(obtenida).not.toBeNull();
    expect(obtenida?.nombre).toBe('Santander Río');
    expect(obtenida?.saldo_actual).toBe(500000);
    expect(obtenida?.identificadores_cuenta.alias).toContain('aldo.santander.ars');

    // Buscar por alias
    const porAlias = await repoCuentas.buscarPorIdentificador('aldo.santander.ars');
    expect(porAlias?.id).toBe('cta-1');

    // Actualizar saldo
    await repoCuentas.actualizarSaldo('cta-1', 450000);
    const actualizada = await repoCuentas.obtenerPorId('cta-1');
    expect(actualizada?.saldo_actual).toBe(450000);
  });

  it('debe persistir tarjetas y buscarlas por sus últimos 4 dígitos', async () => {
    const cuenta: Cuenta = {
      id: 'cta-1',
      nombre: 'Cuenta Operativa',
      tipo_cuenta: 'CAJA_AHORRO',
      moneda: 'ARS',
      saldo_actual: 10000,
      identificadores_cuenta: {}
    };
    await repoCuentas.guardar(cuenta);

    const tarjeta: TarjetaCredito = {
      id: 'tc-1',
      banco_emisor: 'Santander',
      marca_tarjeta: 'VISA',
      ultimos_cuatro_digitos: '4589',
      dia_cierre_resumen: 20,
      dia_vencimiento_pago: 28,
      id_cuenta_liquidacion: 'cta-1'
    };

    await repoTarjetas.guardar(tarjeta);

    const encontrada = await repoTarjetas.obtenerPorUltimosDigitos('4589');
    expect(encontrada).not.toBeNull();
    expect(encontrada?.marca_tarjeta).toBe('VISA');
    expect(encontrada?.dia_cierre_resumen).toBe(20);
  });

  it('debe persistir miembros familiares con sus tarjetas y categorías asignadas', async () => {
    const miembro: MiembroFamilia = {
      id: 'm-1',
      nombre: 'Hija 1',
      rol: 'DEPENDIENTE_SEMI',
      digitos_tarjetas_asignadas: ['4589', '9911'],
      techo_presupuesto_mensual: 80000,
      categorias_autorizadas: ['Salud', 'Farmacia', 'Educacion']
    };

    await repoMiembros.guardar(miembro);

    const obtenido = await repoMiembros.obtenerPorId('m-1');
    expect(obtenido?.nombre).toBe('Hija 1');
    expect(obtenido?.categorias_autorizadas).toContain('Salud');

    const porTarjeta = await repoMiembros.obtenerPorDigitosTarjeta('9911');
    expect(porTarjeta?.id).toBe('m-1');
  });

  it('debe persistir transacciones, filtrar por estado y buscar por hash de conciliación', async () => {
    const miembro: MiembroFamilia = {
      id: 'm-titular',
      nombre: 'Titular',
      rol: 'TITULAR_PRINCIPAL',
      digitos_tarjetas_asignadas: ['1111']
    };
    await repoMiembros.guardar(miembro);

    const tx: Transaccion = {
      id: 'tx-1',
      id_miembro_familia: 'm-titular',
      fecha_transaccion: new Date('2026-05-10T12:00:00Z'),
      monto: 15400,
      moneda: 'ARS',
      tipo_transaccion: 'GASTO',
      nivel_rigidez: 'OPERATIVO_ELASTICO',
      categoria: 'Combustible',
      comercio: 'YPF Resistencia',
      estado: 'PROVISORIO',
      hash_conciliacion: '2026-05-10_15400.00_YPF_RESISTENCIA_NO_CARD'
    };

    await repoTransacciones.guardar(tx);

    const provisorias = await repoTransacciones.obtenerProvisorias();
    expect(provisorias).toHaveLength(1);
    expect(provisorias[0].monto).toBe(15400);

    const porHash = await repoTransacciones.buscarPorHashConciliacion('2026-05-10_15400.00_YPF_RESISTENCIA_NO_CARD');
    expect(porHash?.id).toBe('tx-1');

    await repoTransacciones.actualizarEstado('tx-1', 'CONFIRMADO', new Date('2026-05-12T10:00:00Z'));
    const confirmada = await repoTransacciones.obtenerPorId('tx-1');
    expect(confirmada?.estado).toBe('CONFIRMADO');
    expect(confirmada?.fecha_compensacion).toBeDefined();
  });

  it('debe persistir planes de cuotas con su cronograma de vencimiento', async () => {
    const cuenta: Cuenta = {
      id: 'cta-1',
      nombre: 'Cuenta',
      tipo_cuenta: 'CAJA_AHORRO',
      moneda: 'ARS',
      saldo_actual: 0,
      identificadores_cuenta: {}
    };
    await repoCuentas.guardar(cuenta);

    const tarjeta: TarjetaCredito = {
      id: 'tc-1',
      banco_emisor: 'Banco del Chaco',
      marca_tarjeta: 'TUYA',
      ultimos_cuatro_digitos: '7788',
      dia_cierre_resumen: 25,
      dia_vencimiento_pago: 5,
      id_cuenta_liquidacion: 'cta-1'
    };
    await repoTarjetas.guardar(tarjeta);

    const miembro: MiembroFamilia = {
      id: 'm-titular',
      nombre: 'Titular',
      rol: 'TITULAR_PRINCIPAL',
      digitos_tarjetas_asignadas: ['7788']
    };
    await repoMiembros.guardar(miembro);

    const plan: PlanCuotas = {
      id: 'plan-1',
      id_tarjeta_credito: 'tc-1',
      id_miembro_familia: 'm-titular',
      descripcion: 'Notebook Fravega',
      monto_total: 300000,
      total_cuotas: 3,
      fecha_inicio: new Date('2026-06-01')
    };

    const cuotas: CronogramaCuota[] = [
      { id: 'c-1', id_plan_cuotas: 'plan-1', numero_cuota: 1, monto_cuota: 100000, mes_ciclo_facturacion: '2026-06', estado: 'PENDIENTE' },
      { id: 'c-2', id_plan_cuotas: 'plan-1', numero_cuota: 2, monto_cuota: 100000, mes_ciclo_facturacion: '2026-07', estado: 'PENDIENTE' },
      { id: 'c-3', id_plan_cuotas: 'plan-1', numero_cuota: 3, monto_cuota: 100000, mes_ciclo_facturacion: '2026-08', estado: 'PENDIENTE' }
    ];

    await repoPlanes.guardarPlanConCuotas(plan, cuotas);

    const pendientes = await repoPlanes.obtenerCuotasPendientes('2026-07');
    expect(pendientes).toHaveLength(2); // 2026-06 y 2026-07

    await repoPlanes.marcarCuotaComoFacturada('c-1');
    const pendientesRestantes = await repoPlanes.obtenerCuotasPendientes('2026-07');
    expect(pendientesRestantes).toHaveLength(1);
    expect(pendientesRestantes[0].id).toBe('c-2');

    const planesTarjeta = await repoPlanes.obtenerPlanesPorTarjeta('tc-1');
    expect(planesTarjeta).toHaveLength(1);
    expect(planesTarjeta[0].cuotas).toHaveLength(3);
  });
});
