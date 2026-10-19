import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ControladorPrincipal } from '../../src/presentacion/controladores/ControladorPrincipal.js';
import { sembrarDatosIniciales } from '../../src/presentacion/datos/SembradorDatosIniciales.js';
import { BovedaSqlite } from '../../src/infraestructura/persistencia/BovedaSqlite.js';

describe('Capa de Presentación: ControladorPrincipal', () => {
  let boveda: BovedaSqlite;
  let controlador: ControladorPrincipal;

  beforeEach(async () => {
    boveda = new BovedaSqlite({ ruta: ':memory:' });
    controlador = new ControladorPrincipal(boveda);
    await sembrarDatosIniciales(controlador);
  });

  afterEach(() => {
    boveda.cerrar();
  });

  it('debe calcular las métricas de la Vista Tesorería', async () => {
    const vista = await controlador.obtenerVistaTesoreria({
      diasRestantes: 10,
      reservaContingencia: 100000,
      compromisosInflexibles: 50000
    });

    expect(vista.saldoLiquidoTotal).toBeGreaterThan(0);
    expect(vista.diasRestantes).toBe(10);
    expect(vista.safeToSpendDiario).toBeGreaterThanOrEqual(0);
    expect(vista.ultimasTransacciones.length).toBeGreaterThan(0);
    expect(vista.saldoDisponibleUSD).toBeGreaterThan(0);
    expect(vista.saldoReservaInvertidoUSD).toBe(20000);
    expect(vista.previsionFondeoBancos.length).toBeGreaterThan(0);
    expect(vista.compromisosFijos.length).toBe(6);
  });

  it('debe permitir marcar un compromiso fijo como pagado', async () => {
    await controlador.marcarCompromisoPagado('comp-facultad', true);
    const vista = await controlador.obtenerVistaTesoreria();
    const facultad = vista.compromisosFijos.find(c => c.id === 'comp-facultad');
    expect(facultad?.estado).toBe('PAGADO');
  });

  it('debe proyectar las métricas de la Vista Tarjetas a 12 meses', async () => {
    const vista = await controlador.obtenerVistaTarjetas(4400000);

    expect(vista.tarjetas).toHaveLength(9);
    expect(vista.tarjetas.some(t => t.marca === 'VISA')).toBe(true);
    expect(vista.tarjetas.some(t => t.marca === 'AMEX')).toBe(true);
    expect(vista.cascada12Meses).toHaveLength(12);
  });

  it('debe desglosar los centros de costo de la Vista Familia con burn-rate', async () => {
    const vista = await controlador.obtenerVistaFamilia(15);

    expect(vista.miembros).toHaveLength(4);
    const titular = vista.miembros.find(m => m.rol === 'TITULAR_PRINCIPAL');
    expect(titular).toBeDefined();
    expect(titular?.nombre).toBe('Aldo');
    expect(titular?.velocidadGastoDiario).toBeGreaterThanOrEqual(0);
  });

  it('debe emitir el informe de la Vista Auditoría', async () => {
    const informe = await controlador.obtenerVistaAuditoria(15);

    expect(informe.balanceCaja).toBeDefined();
    expect(informe.balanceCaja.ingresosGenuinosNetos).toBe(4400000);
    expect(informe.directivaMatematica).toBeDefined();
    expect(informe.directivaMatematica.safeToSpendDiarioAjustado).toBeGreaterThanOrEqual(0);
  });

  it('debe procesar entrada rápida T+0 y generar plan de cuotas si corresponde', async () => {
    // 1. Gasto simple
    const tx1 = await controlador.ingestarEntradaRapida('18500 nafta santander');
    expect(tx1.monto).toBe(18500);
    expect(tx1.estado).toBe('PROVISORIO');
    expect(tx1.categoria).toBe('Combustible');

    // 2. Gasto en 3 cuotas con tarjeta
    const tx2 = await controlador.ingestarEntradaRapida('90000 fravega visa 3 cuotas');
    expect(tx2.monto).toBe(90000);
    expect(tx2.id_tarjeta_credito).toBeDefined();

    // Verificamos que se hayan generado las 3 cuotas en la base de datos
    const cuotasPendientes = await controlador.repoPlanes.obtenerCuotasPendientes();
    expect(cuotasPendientes.some(c => c.id_plan_cuotas === `plan_${tx2.id}`)).toBe(true);
  });

  it('debe conciliar un archivo CSV subido desde la interfaz', async () => {
    const csvSantander = `
Fecha;Concepto;Comprobante;Débito;Crédito;Saldo
20/05/2026;CARREFOUR RESISTENCIA;1099;45.000,00;;400.000,00
`;
    const resultado = await controlador.procesarArchivoExtracto(csvSantander);
    expect(resultado.tipo).toBe('CUENTA_BANCARIA');
    expect(resultado.res.transaccionesConfirmadasFusionadas.length + resultado.res.transaccionesNuevasInsertadas.length).toBeGreaterThan(0);
  });

  it('debe permitir editar una tarjeta existente y actualizar la vinculación de plásticos', async () => {
    // 1. Aldo tiene la tarjeta Visa 4768
    const vistaPrevia = await controlador.obtenerVistaTarjetas();
    const tarjetaVisa = vistaPrevia.tarjetas.find(t => t.ultimosDigitos === '4768');
    expect(tarjetaVisa).toBeDefined();
    expect(tarjetaVisa?.nombreMiembroFamiliar).toBe('Aldo');

    // 2. Editamos la tarjeta para cambiar su banco, saldo de resumen y reasignarla a Andrea
    await controlador.guardarTarjeta({
      id: tarjetaVisa!.id,
      banco_emisor: 'Banco Santander Río',
      marca_tarjeta: 'VISA',
      ultimos_cuatro_digitos: '4768',
      dia_cierre_resumen: 22,
      dia_vencimiento_pago: 30,
      id_cuenta_liquidacion: 'cta-santander',
      saldo_pesos_resumen: 125000,
      saldo_dolares_resumen: 45
    }, 'm-andrea');

    const vistaActualizada = await controlador.obtenerVistaTarjetas();
    const tarjetaEditada = vistaActualizada.tarjetas.find(t => t.id === tarjetaVisa!.id);
    expect(tarjetaEditada?.banco).toBe('Banco Santander Río');
    expect(tarjetaEditada?.diaCierre).toBe(22);
    expect(tarjetaEditada?.diaVencimiento).toBe(30);
    expect(tarjetaEditada?.saldoPesosResumen).toBe(125000);
    expect(tarjetaEditada?.saldoDolaresResumen).toBe(45);
    expect(tarjetaEditada?.nombreMiembroFamiliar).toBe('Andrea');

    // 3. Verificamos que Andrea tenga asignado el plástico 4768 y Aldo ya no
    const aldo = await controlador.repoMiembros.obtenerPorId('m-aldo');
    const andrea = await controlador.repoMiembros.obtenerPorId('m-andrea');
    expect(aldo?.digitos_tarjetas_asignadas).not.toContain('4768');
    expect(andrea?.digitos_tarjetas_asignadas).toContain('4768');
  });
});

