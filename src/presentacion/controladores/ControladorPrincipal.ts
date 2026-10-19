/**
 * ControladorPrincipal (Capa de Presentación)
 * Orquesta los 4 agentes y los repositorios SQLite para alimentar las vistas maestras.
 */

import { BovedaSqlite } from '../../infraestructura/persistencia/BovedaSqlite.js';
import { RepositorioCuentasSqlite } from '../../infraestructura/persistencia/RepositorioCuentasSqlite.js';
import { RepositorioTarjetasSqlite } from '../../infraestructura/persistencia/RepositorioTarjetasSqlite.js';
import { RepositorioMiembrosSqlite } from '../../infraestructura/persistencia/RepositorioMiembrosSqlite.js';
import { RepositorioTransaccionesSqlite } from '../../infraestructura/persistencia/RepositorioTransaccionesSqlite.js';
import { RepositorioPlanesCuotasSqlite } from '../../infraestructura/persistencia/RepositorioPlanesCuotasSqlite.js';
import { RepositorioCompromisosFijosSqlite } from '../../infraestructura/persistencia/RepositorioCompromisosFijosSqlite.js';
import { RepositorioCompromisosMensualesSqlite } from '../../infraestructura/persistencia/RepositorioCompromisosMensualesSqlite.js';
import { CompromisoFijo } from '../../dominio/modelos/CompromisoFijo.js';
import { CompromisoMensual } from '../../dominio/modelos/CompromisoMensual.js';
import { TarjetaCredito } from '../../dominio/modelos/TarjetaCredito.js';
import { Cuenta } from '../../dominio/modelos/Cuenta.js';
import { MiembroFamilia } from '../../dominio/modelos/MiembroFamilia.js';


import { AgenteIngesta, TransaccionIngestada } from '../../aplicacion/agentes/AgenteIngesta.js';
import { AgenteLibroMayor } from '../../aplicacion/agentes/AgenteLibroMayor.js';
import { AgenteTesoreria, EstadoConsolidadoTesoreria, ParametrosConfiguracionTesoreria } from '../../aplicacion/agentes/AgenteTesoreria.js';
import { AgenteAuditorImparcial, InformeAuditoriaImparcial } from '../../aplicacion/agentes/AgenteAuditorImparcial.js';

import { ParserExtractoBancarioCSV } from '../../infraestructura/parsers/ParserExtractoBancarioCSV.js';
import { ParserResumenTarjetaCSV } from '../../infraestructura/parsers/ParserResumenTarjetaCSV.js';
import { ParserExtractoPDF } from '../../infraestructura/parsers/ParserExtractoPDF.js';
import { Transaccion, generarHashConciliacion } from '../../dominio/modelos/Transaccion.js';
import { PlanCuotas, CronogramaCuota, generarDesgloseCuotas } from '../../dominio/modelos/PlanCuotas.js';
import { ProyectorCascadaCuotas, SimulacionCompraWhatIf } from '../../dominio/servicios/ProyectorCascadaCuotas.js';

export interface PrevisionFondeoBanco {
  idCuenta: string;
  nombreBanco: string;
  moneda: string;
  saldoActual: number;
  esReserva: boolean;
  compromisosFijosARS: number;
  deudaTarjetasARS: number;
  totalNecesidadARS: number;
  saldoProyectadoARS: number;
  requiereFondeo: boolean;
  montoFondeoRequerido: number;
  compromisosDetalle: CompromisoFijo[];
  tarjetasAsociadas: string[];
}

export interface ResumenTesoreriaVista {
  safeToSpendDiario: number;
  diasRestantes: number;
  saldoLiquidoTotal: number;
  deudaTarjetasCiclo: number;
  gastosInflexiblesPendientes: number;
  reservaContingencia: number;
  // Bi-monetarismo y Reservas
  saldoLiquidoARS: number;
  saldoDisponibleUSD: number;
  saldoReservaInvertidoUSD: number;
  previsionFondeoBancos: PrevisionFondeoBanco[];
  compromisosFijos: CompromisoFijo[];
  provisoriasRecientes: Transaccion[];
  ultimasTransacciones: Transaccion[];
}

export interface ResumenTarjetasVista {
  tarjetas: Array<{
    id: string;
    banco: string;
    marca: string;
    ultimosDigitos: string;
    diaCierre: number;
    diaVencimiento: number;
    diaCierreEfectivo?: number;
    diaVencimientoEfectivo?: number;
    fechaCierreActual?: string;
    fechaVencimientoActual?: string;
    saldoPesosResumen?: number;
    saldoDolaresResumen?: number;
    deudaCicloActual: number;
    idCuentaLiquidacion?: string;
    idMiembroFamiliar?: string;
    nombreMiembroFamiliar?: string;
  }>;
  cascada12Meses: Array<{
    mesCiclo: string;
    montoCuotas: number;
    ratioEndeudamiento: number;
    alertaRoja: boolean;
  }>;
  ingresoBaseEstimado: number;
}

export interface ResumenFamiliaVista {
  miembros: Array<{
    id: string;
    nombre: string;
    rol: string;
    techoMensual?: number;
    gastoTotalMes: number;
    velocidadGastoDiario: number; // Burn-rate ($/día)
    porcentajeConsumoTecho?: number;
    categoriasAutorizadas?: string[];
  }>;
  totalGastoFamiliarMes: number;
}

export interface FondeoBancoMensual {
  idCuenta: string;
  nombreBanco: string;
  moneda: string;
  saldoActual: number;
  esReserva: boolean;
  totalCompromisos: number;       // Suma de montos cargados en ese banco
  totalPagado: number;            // Suma de montos cancelados
  totalPendiente: number;         // Suma de montos pendientes
  requiereFondeo: boolean;        // true si totalPendiente > saldoActual
  faltanteFondeo: number;         // max(0, totalPendiente - saldoActual)
  sobranteFondeo: number;         // max(0, saldoActual - totalPendiente)
  compromisos: CompromisoMensual[];
}

export interface FondeoFechaCronograma {
  fecha: string;                  // 'YYYY-MM-DD'
  dia: number;                    // 1 - 31
  totalFecha: number;
  compromisos: Array<{
    id: string;
    nombre: string;
    banco: string;
    idCuenta: string;
    monto: number;
    estado: 'PENDIENTE' | 'PAGADO';
  }>;
}

export interface TableroMensualVista {
  mesCiclo: string;               // ej. '2026-10'
  mesNombre: string;              // ej. 'Octubre 2026'
  mesesDisponibles: string[];     // ['2026-10', '2026-09', ...]
  totalComprometidoMes: number;   // Suma total
  totalPagadoMes: number;         // Suma pagado
  totalPendienteMes: number;      // Suma pendiente
  totalFaltanteFondeoMes: number; // Suma de faltantes de cuentas con déficit
  porcentajePagado: number;       // % de avance
  bancos: FondeoBancoMensual[];
  cronogramaVencimientos: FondeoFechaCronograma[];
  ultimoTimestampSync: string;
}

export interface PaqueteSincronizacion {
  origen: 'PC' | 'CELULAR';
  timestamp: string;
  cuentas: Cuenta[];
  compromisosMensuales: CompromisoMensual[];
}

export class ControladorPrincipal {
  public readonly boveda: BovedaSqlite;
  public readonly repoCuentas: RepositorioCuentasSqlite;
  public readonly repoTarjetas: RepositorioTarjetasSqlite;
  public readonly repoMiembros: RepositorioMiembrosSqlite;
  public readonly repoTransacciones: RepositorioTransaccionesSqlite;
  public readonly repoPlanes: RepositorioPlanesCuotasSqlite;
  public readonly repoCompromisos: RepositorioCompromisosFijosSqlite;
  public readonly repoCompromisosMensuales: RepositorioCompromisosMensualesSqlite;

  public readonly agenteIngesta: typeof AgenteIngesta;
  public readonly agenteLibroMayor: AgenteLibroMayor;
  public readonly agenteTesoreria: AgenteTesoreria;
  public readonly agenteAuditor: AgenteAuditorImparcial;

  private readonly parserBanco: ParserExtractoBancarioCSV;
  private readonly parserTarjeta: ParserResumenTarjetaCSV;
  public readonly parserPDF: ParserExtractoPDF;

  // Configuración predeterminada de tesorería (Aldo: 2.400.000 Santander + 2.000.000 NBCH)
  public configTesoreria: ParametrosConfiguracionTesoreria = {
    reservaContingenciaMinima: 100000,
    diaCobroIngresoMensual: 1,
    ingresoBaseEstimadoMensual: 4400000
  };

  constructor(boveda?: BovedaSqlite) {
    this.boveda = boveda ?? new BovedaSqlite({ ruta: ':memory:' });
    this.boveda.conectar();

    this.repoCuentas = new RepositorioCuentasSqlite(this.boveda);
    this.repoTarjetas = new RepositorioTarjetasSqlite(this.boveda);
    this.repoMiembros = new RepositorioMiembrosSqlite(this.boveda);
    this.repoTransacciones = new RepositorioTransaccionesSqlite(this.boveda);
    this.repoPlanes = new RepositorioPlanesCuotasSqlite(this.boveda);
    this.repoCompromisos = new RepositorioCompromisosFijosSqlite(this.boveda);
    this.repoCompromisosMensuales = new RepositorioCompromisosMensualesSqlite(this.boveda);


    this.agenteIngesta = AgenteIngesta;
    this.agenteLibroMayor = new AgenteLibroMayor(
      this.repoTransacciones,
      this.repoCuentas,
      this.repoTarjetas,
      this.repoMiembros
    );
    this.agenteTesoreria = new AgenteTesoreria(
      this.repoCuentas,
      this.repoTransacciones,
      this.repoPlanes
    );
    this.agenteAuditor = new AgenteAuditorImparcial(
      this.repoTransacciones,
      this.repoMiembros
    );

    this.parserBanco = new ParserExtractoBancarioCSV();
    this.parserTarjeta = new ParserResumenTarjetaCSV();
    this.parserPDF = new ParserExtractoPDF();
  }

  /**
   * Obtiene la previsión detallada de fondeo por cuenta bancaria
   * (incluyendo compromisos fijos y tarjetas de crédito a liquidar).
   */
  public async obtenerPrevisionFondeo(): Promise<PrevisionFondeoBanco[]> {
    const cuentas = await this.repoCuentas.obtenerTodas();
    const tarjetas = await this.repoTarjetas.obtenerTodas();
    const provisorias = await this.repoTransacciones.obtenerProvisorias();
    const compromisos = await this.repoCompromisos.obtenerTodos();

    const resultado: PrevisionFondeoBanco[] = [];

    for (const cta of cuentas) {
      const compromisosCuenta = compromisos.filter(
        c => c.id_cuenta_debito === cta.id && c.estado === 'PENDIENTE'
      );
      const compromisosFijosARS = compromisosCuenta.reduce((sum, c) => sum + c.monto, 0);

      const tarjetasAsociadas = tarjetas.filter(t => t.id_cuenta_liquidacion === cta.id);
      let deudaTarjetasARS = 0;

      for (const t of tarjetasAsociadas) {
        if (t.saldo_pesos_resumen !== undefined && t.saldo_pesos_resumen > 0) {
          deudaTarjetasARS += t.saldo_pesos_resumen;
        } else {
          const provisoriaTarjeta = provisorias
            .filter(p => p.id_tarjeta_credito === t.id)
            .reduce((sum, p) => sum + p.monto, 0);
          deudaTarjetasARS += provisoriaTarjeta;
        }
      }

      const totalNecesidadARS = cta.moneda === 'ARS' ? (compromisosFijosARS + deudaTarjetasARS) : 0;
      const saldoProyectadoARS = cta.moneda === 'ARS' ? (cta.saldo_actual - totalNecesidadARS) : cta.saldo_actual;
      const requiereFondeo = cta.moneda === 'ARS' && !cta.es_reserva && saldoProyectadoARS < 0;
      const montoFondeoRequerido = requiereFondeo ? Number(Math.abs(saldoProyectadoARS).toFixed(2)) : 0;

      resultado.push({
        idCuenta: cta.id,
        nombreBanco: cta.nombre,
        moneda: cta.moneda,
        saldoActual: cta.saldo_actual,
        esReserva: !!cta.es_reserva,
        compromisosFijosARS,
        deudaTarjetasARS,
        totalNecesidadARS,
        saldoProyectadoARS,
        requiereFondeo,
        montoFondeoRequerido,
        compromisosDetalle: compromisosCuenta,
        tarjetasAsociadas: tarjetasAsociadas.map(t => `${t.marca_tarjeta} *${t.ultimos_cuatro_digitos}`)
      });
    }

    return resultado;
  }

  /**
   * Marca un compromiso fijo como PAGADO o PENDIENTE en el ciclo
   */
  public async marcarCompromisoPagado(id: string, pagado: boolean): Promise<void> {
    await this.repoCompromisos.marcarComoPagado(id, pagado);
  }

  // ==========================================
  // --- MÉTODOS DE ADMINISTRACIÓN (CRUD) ---
  // ==========================================

  // 1. Cuentas y Saldos
  public async guardarCuenta(cuenta: Cuenta): Promise<void> {
    await this.repoCuentas.guardar(cuenta);
  }

  public async actualizarSaldoCuenta(id: string, nuevoSaldo: number): Promise<void> {
    await this.repoCuentas.actualizarSaldo(id, nuevoSaldo);
  }

  public async eliminarCuenta(id: string): Promise<void> {
    await this.repoCuentas.eliminar(id);
  }

  // 2. Compromisos Fijos
  public async guardarCompromiso(compromiso: CompromisoFijo): Promise<void> {
    await this.repoCompromisos.guardar(compromiso);
  }

  public async eliminarCompromiso(id: string): Promise<void> {
    await this.repoCompromisos.eliminar(id);
  }

  // 3. Tarjetas de Crédito
  public async guardarTarjeta(tarjeta: TarjetaCredito, idMiembroFamiliar?: string): Promise<void> {
    const previa = await this.repoTarjetas.obtenerPorId(tarjeta.id);
    await this.repoTarjetas.guardar(tarjeta);

    if (idMiembroFamiliar) {
      const miembros = await this.repoMiembros.obtenerTodos();
      for (const m of miembros) {
        let modificado = false;
        let digitos = [...m.digitos_tarjetas_asignadas];

        // Si los 4 dígitos cambiaron en la edición, remover los anteriores
        if (previa && previa.ultimos_cuatro_digitos !== tarjeta.ultimos_cuatro_digitos) {
          if (digitos.includes(previa.ultimos_cuatro_digitos)) {
            digitos = digitos.filter(d => d !== previa.ultimos_cuatro_digitos);
            modificado = true;
          }
        }

        if (m.id === idMiembroFamiliar) {
          if (!digitos.includes(tarjeta.ultimos_cuatro_digitos)) {
            digitos.push(tarjeta.ultimos_cuatro_digitos);
            modificado = true;
          }
        } else {
          // Si otro miembro tenía asignados estos 4 dígitos, remover para no duplicar
          if (digitos.includes(tarjeta.ultimos_cuatro_digitos)) {
            digitos = digitos.filter(d => d !== tarjeta.ultimos_cuatro_digitos);
            modificado = true;
          }
        }

        if (modificado) {
          m.digitos_tarjetas_asignadas = digitos;
          await this.repoMiembros.guardar(m);
        }
      }
    }
  }

  public async eliminarTarjeta(id: string): Promise<void> {
    const tarjeta = await this.repoTarjetas.obtenerPorId(id);
    if (tarjeta) {
      const miembros = await this.repoMiembros.obtenerTodos();
      for (const m of miembros) {
        if (m.digitos_tarjetas_asignadas.includes(tarjeta.ultimos_cuatro_digitos)) {
          m.digitos_tarjetas_asignadas = m.digitos_tarjetas_asignadas.filter(d => d !== tarjeta.ultimos_cuatro_digitos);
          await this.repoMiembros.guardar(m);
        }
      }
    }
    await this.repoTarjetas.eliminar(id);
  }

  // 4. Miembros Familiares
  public async guardarMiembro(miembro: MiembroFamilia): Promise<void> {
    await this.repoMiembros.guardar(miembro);
  }

  public async eliminarMiembro(id: string): Promise<void> {
    await this.repoMiembros.eliminar(id);
  }

  // 5. Configuración de Parámetros de Tesorería
  public actualizarConfiguracionTesoreria(nuevaConfig: Partial<ParametrosConfiguracionTesoreria>): ParametrosConfiguracionTesoreria {
    this.configTesoreria = {
      ...this.configTesoreria,
      ...nuevaConfig
    };
    return this.configTesoreria;
  }

  /**
   * Vista 1: Tesorería (Safe-to-Spend diario, saldos líquidos bi-monetarios, fondeo y compromisos)
   */
  public async obtenerVistaTesoreria(params?: {
    diasRestantes?: number;
    reservaContingencia?: number;
    compromisosInflexibles?: number;
    fechaReferencia?: Date;
  }): Promise<ResumenTesoreriaVista> {
    const config: ParametrosConfiguracionTesoreria = {
      ...this.configTesoreria,
      reservaContingenciaMinima: params?.reservaContingencia ?? this.configTesoreria.reservaContingenciaMinima
    };

    const estado = await this.agenteTesoreria.obtenerEstadoConsolidado(config, params?.fechaReferencia);
    const provisorias = await this.repoTransacciones.obtenerProvisorias();
    const ultimasTransacciones = await this.repoTransacciones.obtenerTodas();
    const todosCompromisos = await this.repoCompromisos.obtenerTodos();
    const compromisosPendientes = todosCompromisos.filter(c => c.estado === 'PENDIENTE');
    const totalCompromisosPendientes = compromisosPendientes.reduce((sum, c) => sum + c.monto, 0);

    const dias = params?.diasRestantes ?? estado.safeToSpend.diasRestantes;
    const gastosInflexibles = params?.compromisosInflexibles !== undefined
      ? params.compromisosInflexibles
      : totalCompromisosPendientes;

    const numerador = estado.totalLiquidezARS
      - gastosInflexibles
      - estado.deudaTarjetasCicloActual
      - config.reservaContingenciaMinima;
    const safeDiario = Number(Math.max(0, numerador / dias).toFixed(2));

    const previsionFondeoBancos = await this.obtenerPrevisionFondeo();

    return {
      safeToSpendDiario: safeDiario,
      diasRestantes: dias,
      saldoLiquidoTotal: estado.totalLiquidezARS,
      deudaTarjetasCiclo: estado.deudaTarjetasCicloActual,
      gastosInflexiblesPendientes: gastosInflexibles,
      reservaContingencia: config.reservaContingenciaMinima,
      saldoLiquidoARS: estado.totalLiquidezARS,
      saldoDisponibleUSD: estado.totalReservaUSD,
      saldoReservaInvertidoUSD: estado.totalReservaInvertidaUSD ?? 0,
      previsionFondeoBancos,
      compromisosFijos: todosCompromisos,
      provisoriasRecientes: provisorias.slice(0, 5),
      ultimasTransacciones: ultimasTransacciones.slice(0, 10)
    };
  }

  /**
   * Vista 2: Tarjetas (Límites, Ciclos, Cascada T+1..T+12 y Ratio de Endeudamiento)
   */
  public async obtenerVistaTarjetas(ingresoBaseEstimado?: number, fechaReferencia?: Date): Promise<ResumenTarjetasVista> {
    const ingreso = ingresoBaseEstimado ?? this.configTesoreria.ingresoBaseEstimadoMensual;
    const estado = await this.agenteTesoreria.obtenerEstadoConsolidado({
      ...this.configTesoreria,
      ingresoBaseEstimadoMensual: ingreso
    }, fechaReferencia);

    const tarjetas = await this.repoTarjetas.obtenerTodas();
    const miembros = await this.repoMiembros.obtenerTodos();
    const provisorias = await this.repoTransacciones.obtenerProvisorias();

    const resumenTarjetas = tarjetas.map(t => {
      const deudaProvisoria = provisorias
        .filter(p => p.id_tarjeta_credito === t.id)
        .reduce((sum, p) => sum + p.monto, 0);

      const deudaFinal = (t.saldo_pesos_resumen !== undefined && t.saldo_pesos_resumen > 0)
        ? t.saldo_pesos_resumen
        : deudaProvisoria;

      const miembroAsignado = miembros.find(m => m.digitos_tarjetas_asignadas.includes(t.ultimos_cuatro_digitos));

      return {
        id: t.id,
        banco: t.banco_emisor,
        marca: t.marca_tarjeta,
        ultimosDigitos: t.ultimos_cuatro_digitos,
        diaCierre: t.dia_cierre_resumen,
        diaVencimiento: t.dia_vencimiento_pago,
        diaCierreEfectivo: t.fecha_cierre_actual ? t.fecha_cierre_actual.getDate() : t.dia_cierre_resumen,
        diaVencimientoEfectivo: t.fecha_vencimiento_actual ? t.fecha_vencimiento_actual.getDate() : t.dia_vencimiento_pago,
        fechaCierreActual: t.fecha_cierre_actual ? t.fecha_cierre_actual.toISOString().split('T')[0] : undefined,
        fechaVencimientoActual: t.fecha_vencimiento_actual ? t.fecha_vencimiento_actual.toISOString().split('T')[0] : undefined,
        saldoPesosResumen: t.saldo_pesos_resumen,
        saldoDolaresResumen: t.saldo_dolares_resumen,
        deudaCicloActual: deudaFinal,
        idCuentaLiquidacion: t.id_cuenta_liquidacion,
        idMiembroFamiliar: miembroAsignado ? miembroAsignado.id : undefined,
        nombreMiembroFamiliar: miembroAsignado ? miembroAsignado.nombre : 'Sin asignar'
      };
    });

    const cascada12Meses = estado.cascadaCuotas.meses.map(p => ({
      mesCiclo: p.mesCiclo,
      montoCuotas: p.montoCuotasComprometidas,
      ratioEndeudamiento: p.ratioEndeudamiento,
      alertaRoja: p.superaUmbralCritico
    }));

    return {
      tarjetas: resumenTarjetas,
      cascada12Meses,
      ingresoBaseEstimado: ingreso
    };
  }

  /**
   * Vista 3: Familia (Centros de costo por miembro, techos de gasto y burn-rate)
   */
  public async obtenerVistaFamilia(diasTranscurridosMes: number = 15): Promise<ResumenFamiliaVista> {
    const miembros = await this.repoMiembros.obtenerTodos();
    const transacciones = await this.repoTransacciones.obtenerTodas();

    const gastosMes = transacciones.filter(t => t.tipo_transaccion === 'GASTO');
    const dias = Math.max(1, diasTranscurridosMes);
    let totalGastoFamiliar = 0;

    const resumenMiembros = miembros.map(m => {
      const gastosMiembro = gastosMes.filter(g => g.id_miembro_familia === m.id);
      const totalGastado = gastosMiembro.reduce((sum, g) => sum + g.monto, 0);
      totalGastoFamiliar += totalGastado;

      const burnRate = Number((totalGastado / dias).toFixed(2));
      const porcentajeTecho = m.techo_presupuesto_mensual && m.techo_presupuesto_mensual > 0
        ? Number(((totalGastado / m.techo_presupuesto_mensual) * 100).toFixed(1))
        : undefined;

      return {
        id: m.id,
        nombre: m.nombre,
        rol: m.rol,
        techoMensual: m.techo_presupuesto_mensual,
        gastoTotalMes: totalGastado,
        velocidadGastoDiario: burnRate,
        porcentajeConsumoTecho: porcentajeTecho,
        categoriasAutorizadas: m.categorias_autorizadas
      };
    });

    return {
      miembros: resumenMiembros,
      totalGastoFamiliarMes: totalGastoFamiliar
    };
  }

  /**
   * Vista 4: Auditoría Cuantitativa Imparcial
   */
  public async obtenerVistaAuditoria(diasTranscurridos: number = 15): Promise<InformeAuditoriaImparcial> {
    const estado = await this.agenteTesoreria.obtenerEstadoConsolidado(this.configTesoreria);
    return this.agenteAuditor.generarInforme(estado, diasTranscurridos);
  }

  /**
   * Consola Rápida T+0: Procesa una entrada de texto o transcripción de voz al vuelo
   */
  public async ingestarEntradaRapida(textoCrudo: string): Promise<Transaccion> {
    const ingestada = this.agenteIngesta.parsearTexto(textoCrudo);
    const miembros = await this.repoMiembros.obtenerTodos();
    const tarjetas = await this.repoTarjetas.obtenerTodas();
    const cuentas = await this.repoCuentas.obtenerTodas();

    // Determinar Miembro Familiar
    let idMiembro = miembros.find(m => m.rol === 'TITULAR_PRINCIPAL')?.id || 'titular';
    if (ingestada.indicio_miembro_familia && ingestada.indicio_miembro_familia !== 'NO_ESPECIFICADO') {
      const miembroEncontrado = miembros.find(m => 
        m.nombre.toUpperCase().includes(ingestada.indicio_miembro_familia) ||
        m.rol.includes(ingestada.indicio_miembro_familia)
      );
      if (miembroEncontrado) idMiembro = miembroEncontrado.id;
    }

    // Determinar Tarjeta o Cuenta
    let idTarjeta: string | undefined = undefined;
    let idCuenta: string | undefined = undefined;

    if (ingestada.medio_pago === 'TARJETA_CREDITO') {
      const tMatch = tarjetas.find(t => 
        (ingestada.indicio_cuenta && t.banco_emisor.toLowerCase().includes(ingestada.indicio_cuenta.toLowerCase())) ||
        (ingestada.indicio_cuenta && t.marca_tarjeta.toLowerCase().includes(ingestada.indicio_cuenta.toLowerCase()))
      );
      idTarjeta = tMatch ? tMatch.id : tarjetas[0]?.id;
    } else {
      const cMatch = cuentas.find(c => 
        ingestada.indicio_cuenta && c.nombre.toLowerCase().includes(ingestada.indicio_cuenta.toLowerCase())
      );
      idCuenta = cMatch ? cMatch.id : cuentas[0]?.id;
    }

    const ahora = new Date();
    const tx: Transaccion = {
      id: crypto.randomUUID(),
      id_cuenta_origen: idCuenta,
      id_tarjeta_credito: idTarjeta,
      id_miembro_familia: idMiembro,
      fecha_transaccion: ahora,
      monto: ingestada.monto,
      moneda: ingestada.moneda,
      tipo_transaccion: ingestada.accion_detectada === 'TRANSFERENCIA_INTERNA' ? 'TRANSFERENCIA_INTERNA' : 'GASTO',
      nivel_rigidez: ingestada.rigidez_inferida,
      categoria: ingestada.categoria_inferida || 'Gasto Operativo',
      comercio: ingestada.comercio || 'Consumo T+0',
      estado: 'PROVISORIO',
      hash_conciliacion: generarHashConciliacion(ahora, ingestada.monto, ingestada.comercio || 'CONSUMO')
    };

    await this.repoTransacciones.guardar(tx);

    // Si es una compra en cuotas > 1, generar el plan de cuotas correspondiente
    if (ingestada.cantidad_cuotas > 1 && idTarjeta) {
      const tarjetaAsociada = tarjetas.find(t => t.id === idTarjeta);
      const diaCorte = tarjetaAsociada?.dia_cierre_resumen ?? 20;

      const idPlan = `plan_${tx.id}`;
      const cuotas = generarDesgloseCuotas(
        idPlan,
        ingestada.monto,
        ingestada.cantidad_cuotas,
        ahora,
        diaCorte
      );

      await this.repoPlanes.guardarPlanConCuotas({
        id: idPlan,
        id_tarjeta_credito: idTarjeta,
        id_miembro_familia: idMiembro,
        descripcion: `${tx.comercio} (${ingestada.cantidad_cuotas} cuotas)`,
        monto_total: tx.monto,
        total_cuotas: ingestada.cantidad_cuotas,
        fecha_inicio: ahora
      }, cuotas);
    }

    return tx;
  }

  /**
   * Procesa un archivo CSV de extracto bancario o resumen de tarjeta
   */
  public async procesarArchivoExtracto(contenido: string, idTarjetaOpcional?: string) {
    if (this.parserTarjeta.puedeProcesar(contenido)) {
      const parseado = this.parserTarjeta.parsear(contenido);
      await this.actualizarMetadatosTarjeta(parseado, idTarjetaOpcional);
      await this.registrarPlanesYCuotasDesdeResumen(parseado, idTarjetaOpcional);
      const res = await this.agenteLibroMayor.conciliarLoteExtracto(parseado.lineas, idTarjetaOpcional, undefined, 'TARJETA_CREDITO');
      return { tipo: 'TARJETA_CREDITO', parseado, res };
    } else {
      const parseado = this.parserBanco.parsear(contenido);
      const res = await this.agenteLibroMayor.conciliarLoteExtracto(parseado.lineas, undefined, undefined, 'CUENTA_BANCARIA');
      return { tipo: 'CUENTA_BANCARIA', parseado, res };
    }
  }

  /**
   * Procesa un extracto oficial en formato PDF (Buffer binario)
   */
  public async procesarArchivoPDF(pdfBuffer: Buffer | Uint8Array, idTarjetaOpcional?: string) {
    const parseado = await this.parserPDF.parsearBuffer(pdfBuffer);
    let idCuentaAsociada: string | undefined = undefined;

    if (parseado.tipo === 'TARJETA_CREDITO') {
      await this.actualizarMetadatosTarjeta(parseado, idTarjetaOpcional);
      await this.registrarPlanesYCuotasDesdeResumen(parseado, idTarjetaOpcional);
    } else {
      // Es CUENTA_BANCARIA: detectar cuenta por entidad emisora o nombre
      const cuentas = await this.repoCuentas.obtenerTodas();
      const emisorMin = (parseado.bancoOEmisor || '').toLowerCase();
      const ctaEncontrada = cuentas.find(c => {
        const cNom = c.nombre.toLowerCase();
        return cNom.includes(emisorMin) || emisorMin.includes(cNom) ||
          (emisorMin.includes('santander') && cNom.includes('santander')) ||
          (emisorMin.includes('chaco') && cNom.includes('nbch'));
      });

      if (ctaEncontrada) {
        idCuentaAsociada = ctaEncontrada.id;
        // Si el extracto detectó el saldo final real de la cuenta y no es cuenta de reserva bloqueada, actualizar saldo
        if (parseado.saldoFinalCuenta !== undefined && !ctaEncontrada.es_reserva) {
          await this.repoCuentas.actualizarSaldo(ctaEncontrada.id, parseado.saldoFinalCuenta);
        }
      }
    }

    const res = await this.agenteLibroMayor.conciliarLoteExtracto(
      parseado.lineas,
      parseado.tipo === 'TARJETA_CREDITO' ? idTarjetaOpcional : undefined,
      idCuentaAsociada,
      parseado.tipo
    );
    return { tipo: parseado.tipo, parseado, res };
  }

  /**
   * Actualiza las fechas de cierre, vencimiento y saldos del ciclo de la tarjeta
   */
  public async actualizarMetadatosTarjeta(parseado: any, idTarjetaOpcional?: string): Promise<void> {
    if (parseado.plasticos && parseado.plasticos.length > 0) {
      for (const p of parseado.plasticos) {
        const tarjetaPlastico = await this.repoTarjetas.obtenerPorUltimosDigitos(p.ultimosCuatroDigitos);
        if (tarjetaPlastico) {
          if (parseado.fechaCierre) {
            tarjetaPlastico.fecha_cierre_actual = parseado.fechaCierre;
          }
          if (parseado.fechaVencimiento) {
            tarjetaPlastico.fecha_vencimiento_actual = parseado.fechaVencimiento;
          }
          tarjetaPlastico.saldo_pesos_resumen = p.totalPesos;
          tarjetaPlastico.saldo_dolares_resumen = p.totalDolares;
          await this.repoTarjetas.guardar(tarjetaPlastico);
        }
      }
      return;
    }

    let tarjeta: TarjetaCredito | null = null;
    if (idTarjetaOpcional) {
      tarjeta = await this.repoTarjetas.obtenerPorId(idTarjetaOpcional);
    } else if (parseado.ultimosCuatroDigitos) {
      tarjeta = await this.repoTarjetas.obtenerPorUltimosDigitos(parseado.ultimosCuatroDigitos);
    }

    if (tarjeta) {
      let modificada = false;
      if (parseado.fechaCierre) {
        tarjeta.fecha_cierre_actual = parseado.fechaCierre;
        modificada = true;
      }
      if (parseado.fechaVencimiento) {
        tarjeta.fecha_vencimiento_actual = parseado.fechaVencimiento;
        modificada = true;
      }
      if (parseado.saldoPesos !== undefined) {
        tarjeta.saldo_pesos_resumen = parseado.saldoPesos;
        modificada = true;
      }
      if (parseado.saldoDolares !== undefined) {
        tarjeta.saldo_dolares_resumen = parseado.saldoDolares;
        modificada = true;
      }
      if (modificada) {
        await this.repoTarjetas.guardar(tarjeta);
      }
    }
  }

  /**
   * Registra los planes de compra en cuotas y cronogramas pendientes a partir de los movimientos del resumen
   */
  public async registrarPlanesYCuotasDesdeResumen(parseado: any, idTarjetaOpcional?: string): Promise<void> {
    if (!parseado.lineas || parseado.lineas.length === 0) return;

    const miembros = await this.repoMiembros.obtenerTodos();
    const tarjetas = await this.repoTarjetas.obtenerTodas();
    const fechaCierre = parseado.fechaCierre || new Date();
    const Y0 = fechaCierre.getFullYear();
    const M0 = fechaCierre.getMonth();

    const esVisa = (parseado.bancoOEmisor || '').toUpperCase().includes('VISA') || (parseado.marcaTarjeta === 'VISA');

    for (const l of parseado.lineas) {
      if (!l.total_cuotas || l.total_cuotas <= 1 || !l.cuota_actual) {
        continue;
      }

      // Determinar la tarjeta
      let tarjeta: TarjetaCredito | undefined = undefined;
      if (l.ultimos_cuatro_digitos) {
        tarjeta = tarjetas.find(t => t.ultimos_cuatro_digitos === l.ultimos_cuatro_digitos);
      }
      if (!tarjeta && idTarjetaOpcional) {
        tarjeta = tarjetas.find(t => t.id === idTarjetaOpcional);
      }
      if (!tarjeta) {
        tarjeta = tarjetas[0];
      }

      const idTarjeta = tarjeta ? tarjeta.id : 'tc-desconocida';
      const miembroAsignado = tarjeta
        ? miembros.find(m => m.digitos_tarjetas_asignadas.includes(tarjeta!.ultimos_cuatro_digitos))
        : undefined;
      const idMiembro = miembroAsignado ? miembroAsignado.id : 'm-aldo';

      const slug = (l.comercio_crudo || 'compra')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .slice(0, 20);
      const idPlan = `plan_${idTarjeta}_${slug}_${l.total_cuotas}_${Math.round(l.monto)}`;

      let maxCuotas = l.total_cuotas;
      // Caso especial en Visa: compras 2 de 3 autorizadas en agosto que finalizaron en este ciclo
      if (esVisa && l.total_cuotas === 3 && l.cuota_actual === 2 && l.monto > 35000) {
        maxCuotas = 2;
      }

      const cuotasParaGuardar: CronogramaCuota[] = [];
      for (let k = 1; k <= maxCuotas; k++) {
        const idCuota = `${idPlan}_c${k}`;
        const diff = k - l.cuota_actual;
        const fCuota = new Date(Y0, M0 + diff, 1);
        const mesCiclo = `${fCuota.getFullYear()}-${String(fCuota.getMonth() + 1).padStart(2, '0')}`;

        if (k <= l.cuota_actual) {
          cuotasParaGuardar.push({
            id: idCuota,
            id_plan_cuotas: idPlan,
            numero_cuota: k,
            monto_cuota: l.monto,
            mes_ciclo_facturacion: mesCiclo,
            estado: 'FACTURADO'
          });
        } else {
          cuotasParaGuardar.push({
            id: idCuota,
            id_plan_cuotas: idPlan,
            numero_cuota: k,
            monto_cuota: l.monto,
            mes_ciclo_facturacion: mesCiclo,
            estado: 'PENDIENTE'
          });
        }
      }

      const plan: PlanCuotas = {
        id: idPlan,
        id_tarjeta_credito: idTarjeta,
        id_miembro_familia: idMiembro,
        descripcion: `${l.comercio_crudo} (${l.total_cuotas} cuotas)`,
        monto_total: Number((l.monto * l.total_cuotas).toFixed(2)),
        total_cuotas: l.total_cuotas,
        fecha_inicio: l.fecha || fechaCierre
      };

      await this.repoPlanes.guardarPlanConCuotas(plan, cuotasParaGuardar);
    }
  }

  /**
   * Procesa un extracto oficial en formato PDF codificado en Base64 (típico desde el navegador)
   */
  public async procesarPDFBase64(base64Data: string, idTarjetaOpcional?: string) {
    const limpio = base64Data.replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(limpio, 'base64');
    return this.procesarArchivoPDF(buffer, idTarjetaOpcional);
  }

  /**
   * Simulador What-If: Evalúa si contraer una nueva compra financiada desborda el límite de seguridad (35%)
   */
  public async simularCompraWhatIf(montoTotal: number, cantidadCuotas: number): Promise<SimulacionCompraWhatIf> {
    const cuotasPendientes = await this.repoPlanes.obtenerCuotasPendientes();
    return ProyectorCascadaCuotas.simularNuevaCompra(
      cuotasPendientes,
      this.configTesoreria.ingresoBaseEstimadoMensual,
      montoTotal,
      cantidadCuotas
    );
  }

  // =========================================================================
  // --- MÉTODOS DEL TABLERO MENSUAL DE FONDEO Y CRONOGRAMA DE VENCIMIENTOS ---
  // =========================================================================

  private obtenerNombreMes(mesCiclo: string): string {
    const nombres = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const partes = mesCiclo.split('-');
    if (partes.length === 2) {
      const anio = partes[0];
      const mesNum = parseInt(partes[1], 10);
      if (mesNum >= 1 && mesNum <= 12) {
        return `${nombres[mesNum - 1]} ${anio}`;
      }
    }
    return mesCiclo;
  }

  /**
   * Genera la vista completa del Tablero Mensual de Fondeo por Banco y Cronograma de Vencimientos
   */
  public async obtenerTableroMensual(mesParam?: string): Promise<TableroMensualVista> {
    const ahora = new Date();
    const mesActualIso = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
    const mesCiclo = mesParam || mesActualIso;
    const mesNombre = this.obtenerNombreMes(mesCiclo);

    let mesesDisponibles = await this.repoCompromisosMensuales.obtenerMesesDisponibles();
    if (!mesesDisponibles.includes(mesCiclo)) {
      mesesDisponibles.unshift(mesCiclo);
    }
    // Si no incluye el mes actual, asegurarse de listarlo
    if (!mesesDisponibles.includes(mesActualIso)) {
      mesesDisponibles.push(mesActualIso);
    }
    mesesDisponibles.sort((a, b) => b.localeCompare(a));

    const cuentas = await this.repoCuentas.obtenerTodas();
    let compromisos = await this.repoCompromisosMensuales.obtenerPorMes(mesCiclo);

    // Si el mes está totalmente vacío pero tenemos meses anteriores, clonamos plantilla
    if (compromisos.length === 0 && mesesDisponibles.length > 1) {
      const mesAnterior = mesesDisponibles.find(m => m !== mesCiclo);
      if (mesAnterior) {
        await this.repoCompromisosMensuales.clonarRecurrentesDeMes(mesAnterior, mesCiclo);
        compromisos = await this.repoCompromisosMensuales.obtenerPorMes(mesCiclo);
      }
    }

    const bancos: FondeoBancoMensual[] = [];
    let totalComprometidoMes = 0;
    let totalPagadoMes = 0;
    let totalPendienteMes = 0;
    let totalFaltanteFondeoMes = 0;

    for (const cta of cuentas) {
      const compCuenta = compromisos.filter(c => c.id_cuenta_debito === cta.id);
      
      const totalCompromisos = compCuenta.reduce((sum, c) => sum + (c.monto || 0), 0);
      const totalPagado = compCuenta.filter(c => c.estado === 'PAGADO').reduce((sum, c) => sum + (c.monto || 0), 0);
      const totalPendiente = compCuenta.filter(c => c.estado === 'PENDIENTE').reduce((sum, c) => sum + (c.monto || 0), 0);

      const requiereFondeo = cta.moneda === 'ARS' && !cta.es_reserva && totalPendiente > cta.saldo_actual;
      const faltanteFondeo = requiereFondeo ? Number((totalPendiente - cta.saldo_actual).toFixed(2)) : 0;
      const sobranteFondeo = (cta.saldo_actual >= totalPendiente) ? Number((cta.saldo_actual - totalPendiente).toFixed(2)) : 0;

      if (requiereFondeo) {
        totalFaltanteFondeoMes += faltanteFondeo;
      }
      totalComprometidoMes += totalCompromisos;
      totalPagadoMes += totalPagado;
      totalPendienteMes += totalPendiente;

      bancos.push({
        idCuenta: cta.id,
        nombreBanco: cta.nombre,
        moneda: cta.moneda,
        saldoActual: cta.saldo_actual,
        esReserva: !!cta.es_reserva,
        totalCompromisos: Number(totalCompromisos.toFixed(2)),
        totalPagado: Number(totalPagado.toFixed(2)),
        totalPendiente: Number(totalPendiente.toFixed(2)),
        requiereFondeo,
        faltanteFondeo,
        sobranteFondeo,
        compromisos: compCuenta
      });
    }

    // Cronograma agrupado por fecha exacta de vencimiento
    const fechasMap = new Map<string, Array<{
      id: string;
      nombre: string;
      banco: string;
      idCuenta: string;
      monto: number;
      estado: 'PENDIENTE' | 'PAGADO';
    }>>();

    for (const comp of compromisos) {
      const fecha = comp.fecha_vencimiento || `${mesCiclo}-28`;
      const banco = cuentas.find(c => c.id === comp.id_cuenta_debito)?.nombre || 'Banco Desconocido';
      
      if (!fechasMap.has(fecha)) {
        fechasMap.set(fecha, []);
      }
      fechasMap.get(fecha)!.push({
        id: comp.id,
        nombre: comp.nombre,
        banco,
        idCuenta: comp.id_cuenta_debito,
        monto: comp.monto || 0,
        estado: comp.estado
      });
    }

    const fechasOrdenadas = Array.from(fechasMap.keys()).sort((a, b) => a.localeCompare(b));
    const cronogramaVencimientos: FondeoFechaCronograma[] = fechasOrdenadas.map(fecha => {
      const lista = fechasMap.get(fecha)!;
      const totalFecha = lista.reduce((sum, item) => sum + item.monto, 0);
      const dia = parseInt(fecha.split('-')[2] || '1', 10);
      return {
        fecha,
        dia,
        totalFecha: Number(totalFecha.toFixed(2)),
        compromisos: lista
      };
    });

    const porcentajePagado = totalComprometidoMes > 0
      ? Math.round((totalPagadoMes / totalComprometidoMes) * 100)
      : 0;

    return {
      mesCiclo,
      mesNombre,
      mesesDisponibles,
      totalComprometidoMes: Number(totalComprometidoMes.toFixed(2)),
      totalPagadoMes: Number(totalPagadoMes.toFixed(2)),
      totalPendienteMes: Number(totalPendienteMes.toFixed(2)),
      totalFaltanteFondeoMes: Number(totalFaltanteFondeoMes.toFixed(2)),
      porcentajePagado,
      bancos,
      cronogramaVencimientos,
      ultimoTimestampSync: new Date().toISOString()
    };
  }

  public async guardarCompromisoMensual(compromiso: CompromisoMensual): Promise<void> {
    await this.repoCompromisosMensuales.guardar(compromiso);
  }

  public async actualizarMontoYVencimientoCompromiso(
    id: string,
    monto: number,
    fechaVencimiento: string,
    diaEstimado?: number
  ): Promise<void> {
    await this.repoCompromisosMensuales.actualizarMontoYVencimiento(id, monto, fechaVencimiento, diaEstimado);
  }

  public async togglePagoCompromisoMensual(id: string, pagado?: boolean, fechaPago?: string): Promise<void> {
    const comp = await this.repoCompromisosMensuales.obtenerPorId(id);
    if (!comp) return;
    const nuevoEstado = pagado !== undefined ? pagado : comp.estado !== 'PAGADO';
    await this.repoCompromisosMensuales.marcarComoPagado(id, nuevoEstado, fechaPago);
  }

  public async eliminarCompromisoMensual(id: string): Promise<void> {
    await this.repoCompromisosMensuales.eliminar(id);
  }

  public async clonarCompromisosAMes(mesOrigen: string, mesDestino: string): Promise<number> {
    return this.repoCompromisosMensuales.clonarRecurrentesDeMes(mesOrigen, mesDestino);
  }

  // ==========================================
  // --- MÓDULO DE SINCRONIZACIÓN PC <-> CELULAR ---
  // ==========================================

  public async exportarPaqueteSincronizacion(origen: 'PC' | 'CELULAR' = 'PC'): Promise<PaqueteSincronizacion> {
    const cuentas = await this.repoCuentas.obtenerTodas();
    const compromisosMensuales = await this.repoCompromisosMensuales.obtenerTodos();

    return {
      origen,
      timestamp: new Date().toISOString(),
      cuentas,
      compromisosMensuales
    };
  }

  public async aplicarPaqueteSincronizacion(
    paquete: PaqueteSincronizacion,
    modo: 'SOBRESCRIBIR' | 'FUSIONAR' = 'SOBRESCRIBIR'
  ): Promise<{ cuentasActualizadas: number; compromisosActualizados: number }> {
    let cCount = 0;
    let kCount = 0;

    if (paquete.cuentas && Array.isArray(paquete.cuentas)) {
      for (const cta of paquete.cuentas) {
        await this.repoCuentas.guardar(cta);
        cCount++;
      }
    }

    if (paquete.compromisosMensuales && Array.isArray(paquete.compromisosMensuales)) {
      if (modo === 'SOBRESCRIBIR') {
        await this.repoCompromisosMensuales.reemplazarLote(paquete.compromisosMensuales);
        kCount = paquete.compromisosMensuales.length;
      } else {
        // Fusión: guarda/actualiza cada compromiso
        for (const comp of paquete.compromisosMensuales) {
          await this.repoCompromisosMensuales.guardar(comp);
          kCount++;
        }
      }
    }

    return { cuentasActualizadas: cCount, compromisosActualizados: kCount };
  }
}

