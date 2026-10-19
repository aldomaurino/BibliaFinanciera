/**
 * SembradorDatosIniciales
 * Configuración real del patrimonio, cuentas bi-monetarias, compromisos fijos y tarjetas de Aldo.
 */

import { ControladorPrincipal } from '../controladores/ControladorPrincipal.js';

export async function sembrarDatosIniciales(controlador: ControladorPrincipal, forzarResiembra: boolean = false): Promise<void> {
  const cuentasExistentes = await controlador.repoCuentas.obtenerTodas();
  const debeSembrarCuentas = cuentasExistentes.length === 0 || forzarResiembra;

  if (debeSembrarCuentas) {


  // 1. Cuentas bancarias, digitales, inversiones y efectivo con saldos reales
  await controlador.repoCuentas.guardar({
    id: 'cta-santander',
    nombre: 'Santander Caja de Ahorro ARS',
    tipo_cuenta: 'CAJA_AHORRO',
    moneda: 'ARS',
    saldo_actual: 12420.92,
    es_reserva: false,
    identificadores_cuenta: {
      alias: ['aldo.santander.ars'],
      cbus: ['0720000000000000000001']
    }
  });

  await controlador.repoCuentas.guardar({
    id: 'cta-santander-usd',
    nombre: 'Santander Caja de Ahorro USD',
    tipo_cuenta: 'CAJA_AHORRO',
    moneda: 'USD',
    saldo_actual: 2556.23,
    es_reserva: false,
    identificadores_cuenta: {
      alias: ['aldo.santander.usd'],
      cbus: ['0720000000000000000002']
    }
  });

  await controlador.repoCuentas.guardar({
    id: 'cta-santander-inv-usd',
    nombre: 'Santander Inversiones USD (Reserva)',
    tipo_cuenta: 'CAJA_AHORRO',
    moneda: 'USD',
    saldo_actual: 20000.00,
    es_reserva: true,
    identificadores_cuenta: {
      alias: ['aldo.santander.inv.usd']
    }
  });

  await controlador.repoCuentas.guardar({
    id: 'cta-nbch',
    nombre: 'NBCH Caja de Ahorro',
    tipo_cuenta: 'CAJA_AHORRO',
    moneda: 'ARS',
    saldo_actual: 58832.72,
    es_reserva: false,
    identificadores_cuenta: {
      alias: ['aldo.nbch.ars'],
      cbus: ['3110000000000000000002']
    }
  });

  await controlador.repoCuentas.guardar({
    id: 'cta-brubank',
    nombre: 'Brubank Banco Digital',
    tipo_cuenta: 'CAJA_AHORRO',
    moneda: 'ARS',
    saldo_actual: 552.91,
    es_reserva: false,
    identificadores_cuenta: {
      alias: ['aldo.brubank.ars'],
      cbus: ['1430000000000000000004']
    }
  });

  await controlador.repoCuentas.guardar({
    id: 'cta-mercadopago',
    nombre: 'Mercado Pago Billetera ARS',
    tipo_cuenta: 'BILLETERA_VIRTUAL',
    moneda: 'ARS',
    saldo_actual: 6919.67,
    es_reserva: false,
    identificadores_cuenta: {
      alias: ['aldo.mp.ars'],
      cvus: ['0000003100000000000003']
    }
  });

  await controlador.repoCuentas.guardar({
    id: 'cta-mercadopago-usd',
    nombre: 'Mercado Pago USD',
    tipo_cuenta: 'BILLETERA_VIRTUAL',
    moneda: 'USD',
    saldo_actual: 150.73,
    es_reserva: false,
    identificadores_cuenta: {
      alias: ['aldo.mp.usd']
    }
  });

  await controlador.repoCuentas.guardar({
    id: 'cta-efectivo',
    nombre: 'Caja Efectivo Físico',
    tipo_cuenta: 'CAJA_EFECTIVO',
    moneda: 'ARS',
    saldo_actual: 0,
    es_reserva: false,
    identificadores_cuenta: {}
  });

  // 2. Miembros de la Familia (Centros de Costo con Plásticos Asignados)
  await controlador.repoMiembros.guardar({
    id: 'm-aldo',
    nombre: 'Aldo',
    rol: 'TITULAR_PRINCIPAL',
    digitos_tarjetas_asignadas: ['4768', '0591', '1690']
  });

  await controlador.repoMiembros.guardar({
    id: 'm-andrea',
    nombre: 'Andrea',
    rol: 'CONYUGE',
    digitos_tarjetas_asignadas: ['0594', '0617']
  });

  await controlador.repoMiembros.guardar({
    id: 'm-chiara',
    nombre: 'Chiara',
    rol: 'DEPENDIENTE_ESTUDIANTE',
    digitos_tarjetas_asignadas: ['0610', '0609']
  });

  await controlador.repoMiembros.guardar({
    id: 'm-juliana',
    nombre: 'Juliana',
    rol: 'DEPENDIENTE_SEMI',
    digitos_tarjetas_asignadas: ['0602', '0583']
  });

  // 3. Tarjetas de Crédito Santander (Titular y Adicionales)
  // Aldo
  await controlador.repoTarjetas.guardar({
    id: 'tc-santander-visa-4768',
    banco_emisor: 'Banco Santander',
    marca_tarjeta: 'VISA',
    ultimos_cuatro_digitos: '4768',
    dia_cierre_resumen: 20,
    dia_vencimiento_pago: 28,
    id_cuenta_liquidacion: 'cta-santander'
  });

  await controlador.repoTarjetas.guardar({
    id: 'tc-santander-amex-0591',
    banco_emisor: 'Banco Santander',
    marca_tarjeta: 'AMEX',
    ultimos_cuatro_digitos: '0591',
    dia_cierre_resumen: 20,
    dia_vencimiento_pago: 28,
    id_cuenta_liquidacion: 'cta-santander'
  });

  await controlador.repoTarjetas.guardar({
    id: 'tc-santander-amex-1690',
    banco_emisor: 'Banco Santander',
    marca_tarjeta: 'AMEX',
    ultimos_cuatro_digitos: '1690',
    dia_cierre_resumen: 20,
    dia_vencimiento_pago: 28,
    id_cuenta_liquidacion: 'cta-santander'
  });

  // Andrea
  await controlador.repoTarjetas.guardar({
    id: 'tc-santander-visa-0594',
    banco_emisor: 'Banco Santander',
    marca_tarjeta: 'VISA',
    ultimos_cuatro_digitos: '0594',
    dia_cierre_resumen: 20,
    dia_vencimiento_pago: 28,
    id_cuenta_liquidacion: 'cta-santander'
  });

  await controlador.repoTarjetas.guardar({
    id: 'tc-santander-amex-0617',
    banco_emisor: 'Banco Santander',
    marca_tarjeta: 'AMEX',
    ultimos_cuatro_digitos: '0617',
    dia_cierre_resumen: 20,
    dia_vencimiento_pago: 28,
    id_cuenta_liquidacion: 'cta-santander'
  });

  // Chiara
  await controlador.repoTarjetas.guardar({
    id: 'tc-santander-visa-0610',
    banco_emisor: 'Banco Santander',
    marca_tarjeta: 'VISA',
    ultimos_cuatro_digitos: '0610',
    dia_cierre_resumen: 20,
    dia_vencimiento_pago: 28,
    id_cuenta_liquidacion: 'cta-santander'
  });

  await controlador.repoTarjetas.guardar({
    id: 'tc-santander-amex-0609',
    banco_emisor: 'Banco Santander',
    marca_tarjeta: 'AMEX',
    ultimos_cuatro_digitos: '0609',
    dia_cierre_resumen: 20,
    dia_vencimiento_pago: 28,
    id_cuenta_liquidacion: 'cta-santander'
  });

  // Juliana
  await controlador.repoTarjetas.guardar({
    id: 'tc-santander-visa-0602',
    banco_emisor: 'Banco Santander',
    marca_tarjeta: 'VISA',
    ultimos_cuatro_digitos: '0602',
    dia_cierre_resumen: 20,
    dia_vencimiento_pago: 28,
    id_cuenta_liquidacion: 'cta-santander'
  });

  await controlador.repoTarjetas.guardar({
    id: 'tc-santander-amex-0583',
    banco_emisor: 'Banco Santander',
    marca_tarjeta: 'AMEX',
    ultimos_cuatro_digitos: '0583',
    dia_cierre_resumen: 20,
    dia_vencimiento_pago: 28,
    id_cuenta_liquidacion: 'cta-santander'
  });

  // 4. Compromisos Fijos Mensuales (Débitos y Transferencias desde Santander)
  await controlador.repoCompromisos.guardar({
    id: 'comp-expensas-bsas',
    nombre: 'Expensas BsAs',
    monto: 600000,
    moneda: 'ARS',
    id_cuenta_debito: 'cta-santander',
    dia_vencimiento_estimado: 10,
    categoria: 'Vivienda',
    estado: 'PENDIENTE'
  });

  await controlador.repoCompromisos.guardar({
    id: 'comp-expensas-girasoles',
    nombre: 'Expensas Girasoles',
    monto: 300000,
    moneda: 'ARS',
    id_cuenta_debito: 'cta-santander',
    dia_vencimiento_estimado: 10,
    categoria: 'Vivienda',
    estado: 'PENDIENTE'
  });

  await controlador.repoCompromisos.guardar({
    id: 'comp-facultad',
    nombre: 'Facultad',
    monto: 900000,
    moneda: 'ARS',
    id_cuenta_debito: 'cta-santander',
    dia_vencimiento_estimado: 5,
    categoria: 'Educación',
    estado: 'PENDIENTE'
  });

  await controlador.repoCompromisos.guardar({
    id: 'comp-luz-bsas',
    nombre: 'Luz BsAs',
    monto: 200000,
    moneda: 'ARS',
    id_cuenta_debito: 'cta-santander',
    dia_vencimiento_estimado: 15,
    categoria: 'Servicios',
    estado: 'PENDIENTE'
  });

  await controlador.repoCompromisos.guardar({
    id: 'comp-arca',
    nombre: 'ARCA (AFIP)',
    monto: 180000,
    moneda: 'ARS',
    id_cuenta_debito: 'cta-santander',
    dia_vencimiento_estimado: 20,
    categoria: 'Impuestos',
    estado: 'PENDIENTE'
  });

  await controlador.repoCompromisos.guardar({
    id: 'comp-la-equitativa',
    nombre: 'La Equitativa (Seguros)',
    monto: 260000,
    moneda: 'ARS',
    id_cuenta_debito: 'cta-santander',
    dia_vencimiento_estimado: 15,
    categoria: 'Seguros',
    estado: 'PENDIENTE'
  });
  }

  // 4.1 Compromisos Mensuales por Ciclo (Tablero de Fondeo y Vencimientos)
  const mesActual = '2026-10';

  const compromisosMesActual = await controlador.repoCompromisosMensuales.obtenerPorMes(mesActual);
  if (compromisosMesActual.length === 0 || forzarResiembra) {
    const ahoraIso = new Date().toISOString();
    const listaInicial = [
      {
        id: `comp-${mesActual}-facultad`,
        id_cuenta_debito: 'cta-santander',
        mes_ciclo: mesActual,
        nombre: 'Facultad',
        categoria: 'Educación',
        monto: 900000,
        moneda: 'ARS' as const,
        dia_vencimiento_estimado: 5,
        fecha_vencimiento: `${mesActual}-05`,
        estado: 'PENDIENTE' as const,
        es_recurrente: true,
        actualizado_en: ahoraIso
      },
      {
        id: `comp-${mesActual}-expensas-bsas`,
        id_cuenta_debito: 'cta-santander',
        mes_ciclo: mesActual,
        nombre: 'Expensas BsAs',
        categoria: 'Vivienda',
        monto: 600000,
        moneda: 'ARS' as const,
        dia_vencimiento_estimado: 10,
        fecha_vencimiento: `${mesActual}-10`,
        estado: 'PENDIENTE' as const,
        es_recurrente: true,
        actualizado_en: ahoraIso
      },
      {
        id: `comp-${mesActual}-expensas-girasoles`,
        id_cuenta_debito: 'cta-santander',
        mes_ciclo: mesActual,
        nombre: 'Expensas Girasoles',
        categoria: 'Vivienda',
        monto: 300000,
        moneda: 'ARS' as const,
        dia_vencimiento_estimado: 10,
        fecha_vencimiento: `${mesActual}-10`,
        estado: 'PENDIENTE' as const,
        es_recurrente: true,
        actualizado_en: ahoraIso
      },
      {
        id: `comp-${mesActual}-luz-bsas`,
        id_cuenta_debito: 'cta-santander',
        mes_ciclo: mesActual,
        nombre: 'Luz BsAs',
        categoria: 'Servicios',
        monto: 200000,
        moneda: 'ARS' as const,
        dia_vencimiento_estimado: 15,
        fecha_vencimiento: `${mesActual}-15`,
        estado: 'PENDIENTE' as const,
        es_recurrente: true,
        actualizado_en: ahoraIso
      },
      {
        id: `comp-${mesActual}-la-equitativa`,
        id_cuenta_debito: 'cta-santander',
        mes_ciclo: mesActual,
        nombre: 'La Equitativa (Seguros)',
        categoria: 'Seguros',
        monto: 260000,
        moneda: 'ARS' as const,
        dia_vencimiento_estimado: 15,
        fecha_vencimiento: `${mesActual}-15`,
        estado: 'PENDIENTE' as const,
        es_recurrente: true,
        actualizado_en: ahoraIso
      },
      {
        id: `comp-${mesActual}-arca`,
        id_cuenta_debito: 'cta-santander',
        mes_ciclo: mesActual,
        nombre: 'ARCA (AFIP)',
        categoria: 'Impuestos',
        monto: 180000,
        moneda: 'ARS' as const,
        dia_vencimiento_estimado: 20,
        fecha_vencimiento: `${mesActual}-20`,
        estado: 'PENDIENTE' as const,
        es_recurrente: true,
        actualizado_en: ahoraIso
      },
      {
        id: `comp-${mesActual}-tc-visa`,
        id_cuenta_debito: 'cta-santander',
        mes_ciclo: mesActual,
        nombre: 'TC Santander Visa (Resumen)',
        categoria: 'Tarjetas',
        monto: 2362544.75,
        moneda: 'ARS' as const,
        dia_vencimiento_estimado: 28,
        fecha_vencimiento: `${mesActual}-28`,
        estado: 'PENDIENTE' as const,
        es_recurrente: true,
        actualizado_en: ahoraIso
      },
      {
        id: `comp-${mesActual}-tc-amex`,
        id_cuenta_debito: 'cta-santander',
        mes_ciclo: mesActual,
        nombre: 'TC Santander American Express (Resumen)',
        categoria: 'Tarjetas',
        monto: 2213797.77,
        moneda: 'ARS' as const,
        dia_vencimiento_estimado: 28,
        fecha_vencimiento: `${mesActual}-28`,
        estado: 'PENDIENTE' as const,
        es_recurrente: true,
        actualizado_en: ahoraIso
      }
    ];

    for (const c of listaInicial) {
      await controlador.repoCompromisosMensuales.guardar(c);
    }
  }


  // 5. Ingresos Genuinos Mensuales Registrados (2.400.000 Santander + 2.000.000 NBCH)
  const ahora = new Date();
  const fechaIngreso = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  await controlador.repoTransacciones.guardar({
    id: 'tx-haberes-santander',
    id_cuenta_origen: 'cta-santander',
    id_miembro_familia: 'm-aldo',
    fecha_transaccion: fechaIngreso,
    monto: 2400000,
    moneda: 'ARS',
    tipo_transaccion: 'INGRESO_GENUINO',
    nivel_rigidez: 'INFLEXIBLE',
    categoria: 'Haberes / Honorarios',
    comercio: 'Acreditación Haberes Santander',
    estado: 'CONFIRMADO'
  });

  await controlador.repoTransacciones.guardar({
    id: 'tx-haberes-nbch',
    id_cuenta_origen: 'cta-nbch',
    id_miembro_familia: 'm-aldo',
    fecha_transaccion: fechaIngreso,
    monto: 2000000,
    moneda: 'ARS',
    tipo_transaccion: 'INGRESO_GENUINO',
    nivel_rigidez: 'INFLEXIBLE',
    categoria: 'Haberes / Honorarios',
    comercio: 'Acreditación Haberes NBCH',
    estado: 'CONFIRMADO'
  });
}
