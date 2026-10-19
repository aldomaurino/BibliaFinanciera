import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BovedaSqlite } from '../../src/infraestructura/persistencia/BovedaSqlite.js';
import { ControladorPrincipal } from '../../src/presentacion/controladores/ControladorPrincipal.js';
import { ServidorLocal } from '../../src/presentacion/servidor/ServidorLocal.js';

describe('Tablero Mensual de Fondeo y Sincronización', () => {
  let boveda: BovedaSqlite;
  let controlador: ControladorPrincipal;

  beforeEach(async () => {
    boveda = new BovedaSqlite({ ruta: ':memory:' });
    boveda.conectar();
    controlador = new ControladorPrincipal(boveda);

    // Cuentas de prueba
    await controlador.repoCuentas.guardar({
      id: 'cta-santander',
      nombre: 'Santander Caja de Ahorro',
      tipo_cuenta: 'CAJA_AHORRO',
      moneda: 'ARS',
      saldo_actual: 500000,
      es_reserva: false,
      identificadores_cuenta: {}
    });

    await controlador.repoCuentas.guardar({
      id: 'cta-nbch',
      nombre: 'NBCH Caja de Ahorro',
      tipo_cuenta: 'CAJA_AHORRO',
      moneda: 'ARS',
      saldo_actual: 200000,
      es_reserva: false,
      identificadores_cuenta: {}
    });
  });

  afterEach(() => {
    boveda.cerrar();
  });


  it('debe calcular correctamente el faltante de fondeo por banco y el consolidado global', async () => {
    const mes = '2026-10';

    // Compromisos en Santander: $600k (Expensas) + $300k (Luz) = $900k
    await controlador.guardarCompromisoMensual({
      id: 'comp-1',
      id_cuenta_debito: 'cta-santander',
      mes_ciclo: mes,
      nombre: 'Expensas BsAs',
      categoria: 'Vivienda',
      monto: 600000,
      moneda: 'ARS',
      dia_vencimiento_estimado: 10,
      fecha_vencimiento: '2026-10-10',
      estado: 'PENDIENTE',
      es_recurrente: true,
      actualizado_en: new Date().toISOString()
    });

    await controlador.guardarCompromisoMensual({
      id: 'comp-2',
      id_cuenta_debito: 'cta-santander',
      mes_ciclo: mes,
      nombre: 'Luz BsAs',
      categoria: 'Servicios',
      monto: 300000,
      moneda: 'ARS',
      dia_vencimiento_estimado: 15,
      fecha_vencimiento: '2026-10-15',
      estado: 'PENDIENTE',
      es_recurrente: true,
      actualizado_en: new Date().toISOString()
    });

    // Compromiso en NBCH: $150k
    await controlador.guardarCompromisoMensual({
      id: 'comp-3',
      id_cuenta_debito: 'cta-nbch',
      mes_ciclo: mes,
      nombre: 'Seguro NBCH',
      categoria: 'Seguros',
      monto: 150000,
      moneda: 'ARS',
      dia_vencimiento_estimado: 20,
      fecha_vencimiento: '2026-10-20',
      estado: 'PENDIENTE',
      es_recurrente: true,
      actualizado_en: new Date().toISOString()
    });

    const tablero = await controlador.obtenerTableroMensual(mes);

    expect(tablero.mesCiclo).toBe('2026-10');
    expect(tablero.totalComprometidoMes).toBe(1050000);
    expect(tablero.totalPendienteMes).toBe(1050000);
    expect(tablero.totalPagadoMes).toBe(0);

    // Santander: tiene 500k, debe 900k -> Faltante = 400k
    const bSantander = tablero.bancos.find(b => b.idCuenta === 'cta-santander');
    expect(bSantander).toBeDefined();
    expect(bSantander!.requiereFondeo).toBe(true);
    expect(bSantander!.faltanteFondeo).toBe(400000);
    expect(bSantander!.sobranteFondeo).toBe(0);

    // NBCH: tiene 200k, debe 150k -> Cubierto, sobrante = 50k
    const bNbch = tablero.bancos.find(b => b.idCuenta === 'cta-nbch');
    expect(bNbch).toBeDefined();
    expect(bNbch!.requiereFondeo).toBe(false);
    expect(bNbch!.faltanteFondeo).toBe(0);
    expect(bNbch!.sobranteFondeo).toBe(50000);

    // Total faltante global
    expect(tablero.totalFaltanteFondeoMes).toBe(400000);
  });

  it('al marcar un compromiso como PAGADO disminuye el pendiente y reduce el faltante', async () => {
    const mes = '2026-10';

    await controlador.guardarCompromisoMensual({
      id: 'comp-1',
      id_cuenta_debito: 'cta-santander',
      mes_ciclo: mes,
      nombre: 'Expensas BsAs',
      categoria: 'Vivienda',
      monto: 600000,
      moneda: 'ARS',
      dia_vencimiento_estimado: 10,
      fecha_vencimiento: '2026-10-10',
      estado: 'PENDIENTE',
      es_recurrente: true,
      actualizado_en: new Date().toISOString()
    });

    // Marcamos como pagado
    await controlador.togglePagoCompromisoMensual('comp-1', true);

    const tablero = await controlador.obtenerTableroMensual(mes);
    expect(tablero.totalPagadoMes).toBe(600000);
    expect(tablero.totalPendienteMes).toBe(0);
    expect(tablero.totalFaltanteFondeoMes).toBe(0);
    expect(tablero.porcentajePagado).toBe(100);

    const bSantander = tablero.bancos.find(b => b.idCuenta === 'cta-santander');
    expect(bSantander!.requiereFondeo).toBe(false);
    expect(bSantander!.totalPagado).toBe(600000);
  });

  it('debe ordenar y agrupar el cronograma de fechas de vencimiento', async () => {
    const mes = '2026-10';

    await controlador.guardarCompromisoMensual({
      id: 'comp-tardio',
      id_cuenta_debito: 'cta-santander',
      mes_ciclo: mes,
      nombre: 'TC Visa',
      categoria: 'Tarjetas',
      monto: 2000000,
      moneda: 'ARS',
      dia_vencimiento_estimado: 28,
      fecha_vencimiento: '2026-10-28',
      estado: 'PENDIENTE',
      es_recurrente: true,
      actualizado_en: new Date().toISOString()
    });

    await controlador.guardarCompromisoMensual({
      id: 'comp-temprano',
      id_cuenta_debito: 'cta-santander',
      mes_ciclo: mes,
      nombre: 'Facultad',
      categoria: 'Educación',
      monto: 900000,
      moneda: 'ARS',
      dia_vencimiento_estimado: 5,
      fecha_vencimiento: '2026-10-05',
      estado: 'PENDIENTE',
      es_recurrente: true,
      actualizado_en: new Date().toISOString()
    });

    const tablero = await controlador.obtenerTableroMensual(mes);
    expect(tablero.cronogramaVencimientos.length).toBe(2);
    expect(tablero.cronogramaVencimientos[0].fecha).toBe('2026-10-05');
    expect(tablero.cronogramaVencimientos[0].totalFecha).toBe(900000);
    expect(tablero.cronogramaVencimientos[1].fecha).toBe('2026-10-28');
    expect(tablero.cronogramaVencimientos[1].totalFecha).toBe(2000000);
  });

  it('debe exportar e importar paquetes de sincronización correctamente', async () => {
    const mes = '2026-10';
    await controlador.guardarCompromisoMensual({
      id: 'comp-sync-1',
      id_cuenta_debito: 'cta-santander',
      mes_ciclo: mes,
      nombre: 'ARCA',
      categoria: 'Impuestos',
      monto: 180000,
      moneda: 'ARS',
      dia_vencimiento_estimado: 20,
      fecha_vencimiento: '2026-10-20',
      estado: 'PENDIENTE',
      es_recurrente: true,
      actualizado_en: new Date().toISOString()
    });

    const paquete = await controlador.exportarPaqueteSincronizacion('CELULAR');
    expect(paquete.origen).toBe('CELULAR');
    expect(paquete.cuentas.length).toBe(2);
    expect(paquete.compromisosMensuales.length).toBe(1);

    // Creamos otra base para simular la importación
    const boveda2 = new BovedaSqlite({ ruta: ':memory:' });
    boveda2.conectar();
    const controlador2 = new ControladorPrincipal(boveda2);

    await controlador2.aplicarPaqueteSincronizacion(paquete, 'SOBRESCRIBIR');
    const compromisosImportados = await controlador2.repoCompromisosMensuales.obtenerPorMes(mes);
    expect(compromisosImportados.length).toBe(1);
    expect(compromisosImportados[0].nombre).toBe('ARCA');
    expect(compromisosImportados[0].monto).toBe(180000);

    boveda2.cerrar();
  });
});

