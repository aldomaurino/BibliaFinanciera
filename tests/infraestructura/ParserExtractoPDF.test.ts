import { describe, it, expect } from 'vitest';
import { ParserExtractoPDF } from '../../src/infraestructura/parsers/ParserExtractoPDF.js';
import { BovedaSqlite } from '../../src/infraestructura/persistencia/BovedaSqlite.js';
import { ControladorPrincipal } from '../../src/presentacion/controladores/ControladorPrincipal.js';
import { sembrarDatosIniciales } from '../../src/presentacion/datos/SembradorDatosIniciales.js';

describe('ParserExtractoPDF (Extractos Bancarios y Tarjetas)', () => {
  const parser = new ParserExtractoPDF();

  it('debe detectar cuenta bancaria y parsear líneas de extracto Santander', () => {
    const textoSantander = `
BANCO SANTANDER ARGENTINA S.A.
Resumen de Cuenta Corriente en Pesos
Titular: Aldo
Cuenta Nro: 072-00012345/6
Período: 01/05/2026 al 31/05/2026

Fecha Detalle Comprobante Débito Crédito Saldo
10/05/2026 YPF RESISTENCIA 1029 18.500,00 481.500,00
11/05/2026 FARMACIA DEL PUEBLO 1030 15.400,00 466.100,00
15/05/2026 HABERES MENSUALES 1031 1.600.000,00 2.066.100,00
`;

    const resultado = parser.parsearTexto(textoSantander);
    expect(resultado.tipo).toBe('CUENTA_BANCARIA');
    expect(resultado.bancoOEmisor).toBe('Banco Santander');
    expect(resultado.lineas.length).toBeGreaterThanOrEqual(3);

    expect(resultado.lineas[0].monto).toBe(18500);
    expect(resultado.lineas[0].comercio_crudo).toContain('YPF RESISTENCIA');
    expect(resultado.lineas[1].monto).toBe(15400);
    expect(resultado.lineas[2].monto).toBe(1600000);
  });

  it('debe detectar resumen de tarjeta de crédito con extensiones y cuotas', () => {
    const textoTarjetaTuya = `
BANCO DEL CHACO S.A. - TARJETA TUYA
RESUMEN DE CUENTA MENSUAL
Titular: Aldo
Tarjeta: **** **** **** 7788
Cierre Actual: 25/05/2026  Vencimiento Actual: 05/06/2026

12/05/2026 SUPERMERCADO BATOCCHIO 42.000,00
14/05/2026 FRAVEGA RESISTENCIA C.01/06 50.000,00
16/05/2026 FARMACITY CHACO *9911 12.350,00
`;

    const resultado = parser.parsearTexto(textoTarjetaTuya);
    expect(resultado.tipo).toBe('TARJETA_CREDITO');
    expect(resultado.bancoOEmisor).toContain('Tarjeta Tuya');
    expect(resultado.ultimosCuatroDigitos).toBe('7788');
    expect(resultado.lineas.length).toBe(3);

    expect(resultado.lineas[0].monto).toBe(42000);
    expect(resultado.lineas[0].ultimos_cuatro_digitos).toBe('7788');

    expect(resultado.lineas[1].monto).toBe(50000);
    expect(resultado.lineas[1].comercio_crudo).toContain('FRAVEGA RESISTENCIA');

    // La tercera línea tiene extensión específica de Hija 1 (*9911)
    expect(resultado.lineas[2].monto).toBe(12350);
    expect(resultado.lineas[2].ultimos_cuatro_digitos).toBe('9911');
  });

  it('debe conciliar transacciones extraídas de PDF vía ControladorPrincipal', async () => {
    const boveda = new BovedaSqlite({ ruta: ':memory:' });
    const controlador = new ControladorPrincipal(boveda);
    await sembrarDatosIniciales(controlador);

    // Cargamos una provisoria en T+0
    await controlador.ingestarEntradaRapida('18500 nafta ypf');

    const hoy = new Date();
    const dia = hoy.getDate().toString().padStart(2, '0');
    const mes = (hoy.getMonth() + 1).toString().padStart(2, '0');
    const anio = hoy.getFullYear();
    const fechaHoyStr = `${dia}/${mes}/${anio}`;

    const textoResumen = `
BANCO SANTANDER - MOVIMIENTOS
Fecha Detalle Importe
${fechaHoyStr} YPF RESISTENCIA 18.500,00
${fechaHoyStr} RESTAURANTE CHACO 22.000,00
`;

    const parseado = parser.parsearTexto(textoResumen);
    const res = await controlador.agenteLibroMayor.conciliarLoteExtracto(parseado.lineas);

    expect(res.lineasProcesadas).toBe(2);
    // YPF debe haber sido conciliada con la provisoria T+0
    expect(res.transaccionesConfirmadasFusionadas.length).toBe(1);
    expect(res.transaccionesNuevasInsertadas.length).toBe(1);

    boveda.cerrar();
  });

  it('debe parsear extracto real Santander separando débitos de créditos y detectando saldo final', async () => {
    const boveda = new BovedaSqlite({ ruta: ':memory:' });
    const controlador = new ControladorPrincipal(boveda);
    await sembrarDatosIniciales(controlador);

    const textoSantanderReal = `
Santander Select
Cuenta Cuenta única 505-350726/3
Moneda Pesos
Fecha 01/09/2026 - 01/10/2026
Últimos movimientos
Fecha Sucursal origen Descripción Referencia Caja de Ahorro Cuenta Corriente Saldo
01/10/2026 000 - CASA CENTRAL - WORK CAFÉ Transferencia realizada A d errico claudio y/o de / varios - var / 20164363083 05581474 -74000.00
01/10/2026 000 - CASA CENTRAL - WORK CAFÉ Credito inversion provisorio movimiento en cuenta online 68865737 2267042.66
28/09/2026 505 - CHARATA Compra con tarjeta de debito Coto digital suc 078 debi - tarj nro. 2413 09315388 -144938.32 12420.92
07/09/2026 000 - CASA CENTRAL - WORK CAFÉ Pago de tarjeta de credito 000004379 -2666215.76 1367970.13
03/09/2026 000 - CASA CENTRAL - WORK CAFÉ Acreditacion de haberes 260903507funcional leon sa cuit 30595938496 34636850 2705345.12 3139189.66
03/09/2026 000 - CASA CENTRAL - WORK CAFÉ Transf recibida cvu mismo titular De aldo ezequiel maurino / mercado pago /23230841829 07061072 4700000.00 7839189.66
`;

    const parseado = parser.parsearTexto(textoSantanderReal);
    expect(parseado.tipo).toBe('CUENTA_BANCARIA');
    expect(parseado.bancoOEmisor).toBe('Banco Santander');
    expect(parseado.saldoFinalCuenta).toBe(12420.92);
    expect(parseado.lineas.length).toBe(6);

    // Conciliamos con ControladorPrincipal
    const res = await controlador.agenteLibroMayor.conciliarLoteExtracto(
      parseado.lineas,
      undefined,
      'cta-santander',
      'CUENTA_BANCARIA'
    );

    expect(res.lineasProcesadas).toBe(6);
    expect(res.totalDebitos).toBe(Number((74000 + 144938.32 + 2666215.76).toFixed(2)));
    expect(res.totalCreditos).toBe(Number((2267042.66 + 2705345.12 + 4700000.00).toFixed(2)));

    const txs = res.transaccionesNuevasInsertadas;

    // 1. Transferencia realizada -> GASTO
    const txGasto = txs.find(t => t.monto === 74000);
    expect(txGasto?.tipo_transaccion).toBe('GASTO');

    // 2. Crédito inversión provisorio -> RESCATE_DESAHORRO (regla dogmática)
    const txInversion = txs.find(t => t.monto === 2267042.66);
    expect(txInversion?.tipo_transaccion).toBe('RESCATE_DESAHORRO');
    expect(txInversion?.categoria).toContain('Desahorro');

    // 3. Compra Coto débito -> GASTO (Supermercado)
    const txCoto = txs.find(t => t.monto === 144938.32);
    expect(txCoto?.tipo_transaccion).toBe('GASTO');
    expect(txCoto?.categoria).toContain('Supermercado');

    // 4. Pago de tarjeta de crédito -> TRANSFERENCIA_INTERNA (evita duplicar resumen)
    const txPagoTC = txs.find(t => t.monto === 2666215.76);
    expect(txPagoTC?.tipo_transaccion).toBe('TRANSFERENCIA_INTERNA');
    expect(txPagoTC?.categoria).toContain('Pago Resumen Tarjeta');

    // 5. Acreditación de haberes -> INGRESO_GENUINO
    const txHaberes = txs.find(t => t.monto === 2705345.12);
    expect(txHaberes?.tipo_transaccion).toBe('INGRESO_GENUINO');
    expect(txHaberes?.categoria).toContain('Haberes');

    // 6. Transferencia entre cuentas propias -> TRANSFERENCIA_INTERNA
    const txPropia = txs.find(t => t.monto === 4700000);
    expect(txPropia?.tipo_transaccion).toBe('TRANSFERENCIA_INTERNA');

    boveda.cerrar();
  });

  it('debe parsear resumen multi-plástico Santander con cuotas futuras y actualizar tarjetas', async () => {
    const textoMultiPlastico = `
Resumen Visa N° 001042525
Total a pagar
En pesos $ 1.283.565,89
En dólares U$S 11,99
Cierre actual 01/10/26
Vencimiento actual 09/10/26

Próximas cuotas a vencer
Octubre 2026
$1.000.000,00
Noviembre 2026
$600.000,00
Diciembre 2026
$400.000,00

Tarjetas incluidas en el resumen
Terminada en 0594
de Andrea Lilia Martin
Total consumido
$ 617.379,98
U$S 9,00
Terminada en 4768
de Aldo Ezequi Maurino
Total consumido
$ 666.185,91
U$S 2,99

Pago anterior y devoluciones
04/09/26 Su pago en pesos 000000 -1.500.000,00

Movimientos de Andrea Lilia Martin terminada en 0594
22/05/26 Tienda lucaya 4 de 6 777430 $ 75.333,33
01/09/26 Netflix U$S 9,00

Movimientos de Aldo Ezequi Maurino terminada en 4768
11/05/26 Simmons ecommerce 5 de 12 001445 $ 500.000,00
`;

    const parseado = parser.parsearTexto(textoMultiPlastico);
    expect(parseado.tipo).toBe('TARJETA_CREDITO');
    expect(parseado.plasticos?.length).toBe(2);
    expect(parseado.plasticos?.[0].ultimosCuatroDigitos).toBe('0594');
    expect(parseado.plasticos?.[0].totalPesos).toBe(617379.98);
    expect(parseado.plasticos?.[0].totalDolares).toBe(9);

    expect(parseado.proyeccionCuotas?.length).toBe(3);
    expect(parseado.proyeccionCuotas?.[1].mesCiclo).toBe('2026-11');
    expect(parseado.proyeccionCuotas?.[1].monto).toBe(600000);

    // No debe incluir "Su pago en pesos"
    expect(parseado.lineas.some(l => l.comercio_crudo.includes('Su pago'))).toBe(false);

    // Debe incluir los movimientos válidos
    expect(parseado.lineas.length).toBe(3);
    const netflix = parseado.lineas.find(l => l.comercio_crudo.includes('Netflix'));
    expect(netflix?.moneda).toBe('USD');
    expect(netflix?.monto).toBe(9);

    const boveda = new BovedaSqlite({ ruta: ':memory:' });
    const controlador = new ControladorPrincipal(boveda);
    await sembrarDatosIniciales(controlador);

    await controlador.actualizarMetadatosTarjeta(parseado);
    await controlador.registrarPlanesYCuotasDesdeResumen(parseado);

    const tAndrea = await controlador.repoTarjetas.obtenerPorUltimosDigitos('0594');
    expect(tAndrea?.saldo_pesos_resumen).toBe(617379.98);
    expect(tAndrea?.saldo_dolares_resumen).toBe(9);
    expect(tAndrea?.fecha_cierre_actual?.toISOString().split('T')[0]).toBe('2026-10-01');

    const cuotas = await controlador.repoPlanes.obtenerCuotasPendientes();
    expect(cuotas.length).toBeGreaterThan(0);

    boveda.cerrar();
  });
});
