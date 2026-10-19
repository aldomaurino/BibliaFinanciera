/**
 * Agente 3: Motor de Tesorería y Proyecciones
 * Calcula en tiempo real la liquidez real disponible, proyecta la cascada de cuotas
 * y monitorea el Safe-to-Spend diario.
 */

import { IRepositorioCuentas } from '../../dominio/repositorios/IRepositorioCuentas.js';
import { IRepositorioTransacciones } from '../../dominio/repositorios/IRepositorioTransacciones.js';
import { IRepositorioPlanesCuotas } from '../../dominio/repositorios/IRepositorioPlanesCuotas.js';
import { CalculadoraSafeToSpend, ResultadoSafeToSpend } from '../../dominio/servicios/CalculadoraSafeToSpend.js';
import { ProyectorCascadaCuotas, ResultadoProyeccionCascada, SimulacionCompraWhatIf } from '../../dominio/servicios/ProyectorCascadaCuotas.js';

export interface ParametrosConfiguracionTesoreria {
  reservaContingenciaMinima: number;
  diaCobroIngresoMensual: number; // Día del mes donde ingresan los fondos (ej: 1 o 5)
  ingresoBaseEstimadoMensual: number;
}

export interface EstadoConsolidadoTesoreria {
  safeToSpend: ResultadoSafeToSpend;
  cascadaCuotas: ResultadoProyeccionCascada;
  totalLiquidezARS: number;
  totalReservaUSD: number;
  totalReservaInvertidaUSD: number;
  totalDesahorroMesActual: number;
  deudaTarjetasCicloActual: number;
}

export class AgenteTesoreria {
  constructor(
    private readonly repoCuentas: IRepositorioCuentas,
    private readonly repoTransacciones: IRepositorioTransacciones,
    private readonly repoPlanesCuotas: IRepositorioPlanesCuotas
  ) {}

  /**
   * Calcula los días restantes para la próxima fecha prevista de ingreso genuino.
   */
  public calcularDiasRestantes(diaCobro: number, fechaActual: Date = new Date()): number {
    const diaHoy = fechaActual.getDate();
    if (diaHoy < diaCobro) {
      return diaCobro - diaHoy;
    }
    // Si ya pasó el día de cobro en este mes, el próximo es el mes que viene
    const año = fechaActual.getFullYear();
    const mes = fechaActual.getMonth();
    const proximoCobro = new Date(año, mes + 1, diaCobro);
    const difMs = proximoCobro.getTime() - fechaActual.getTime();
    return Math.max(1, Math.ceil(difMs / (1000 * 60 * 60 * 24)));
  }

  /**
   * Obtiene el estado consolidado de tesorería y Safe-to-Spend diario.
   */
  public async obtenerEstadoConsolidado(
    config: ParametrosConfiguracionTesoreria,
    fechaActual: Date = new Date()
  ): Promise<EstadoConsolidadoTesoreria> {
    const cuentas = await this.repoCuentas.obtenerTodas();
    
    // 1. Liquidez en ARS y USD disponible vs invertida
    let totalLiquidezARS = 0;
    let totalReservaUSD = 0;
    let totalReservaInvertidaUSD = 0;

    for (const c of cuentas) {
      if (c.moneda === 'ARS' && !c.es_reserva) {
        totalLiquidezARS += c.saldo_actual;
      } else if (c.moneda === 'USD') {
        if (c.es_reserva) {
          totalReservaInvertidaUSD += c.saldo_actual;
        } else {
          totalReservaUSD += c.saldo_actual;
        }
      }
    }

    // 2. Transacciones del ciclo actual
    const todasTx = await this.repoTransacciones.obtenerTodas();
    
    // Gastos inflexibles pendientes
    let gastosInflexiblesPendientes = 0;
    // Consumos en tarjetas del ciclo actual (Provisorias T+0 en tarjeta de crédito)
    let deudaTarjetasT0 = 0;
    // Registro de desahorros ocurridos en el período
    let desahorroMes = 0;

    for (const tx of todasTx) {
      if (tx.tipo_transaccion === 'RESCATE_DESAHORRO') {
        desahorroMes += tx.monto;
      } else if (tx.id_tarjeta_credito && tx.estado === 'PROVISORIO') {
        deudaTarjetasT0 += tx.monto;
      } else if (tx.nivel_rigidez === 'INFLEXIBLE' && tx.estado === 'PROVISORIO') {
        gastosInflexiblesPendientes += tx.monto;
      }
    }

    // 3. Cuotas facturadas o comprometidas del ciclo corriente
    const cuotasPendientes = await this.repoPlanesCuotas.obtenerCuotasPendientes();
    const añoActual = fechaActual.getFullYear();
    const mesActual = String(fechaActual.getMonth() + 1).padStart(2, '0');
    const cicloMesActual = `${añoActual}-${mesActual}`;

    let cuotasCicloActual = 0;
    for (const cuota of cuotasPendientes) {
      if (cuota.mes_ciclo_facturacion === cicloMesActual) {
        cuotasCicloActual += cuota.monto_cuota;
      }
    }

    const deudaTarjetasTotalCiclo = deudaTarjetasT0 + cuotasCicloActual;
    const diasRestantes = this.calcularDiasRestantes(config.diaCobroIngresoMensual, fechaActual);

    // 4. Ecuación Safe-to-Spend
    const safeToSpend = CalculadoraSafeToSpend.calcular({
      saldoLiquidoARS: totalLiquidezARS,
      gastosInflexiblesPendientes,
      deudaTarjetasCicloActual: deudaTarjetasTotalCiclo,
      reservaContingenciaMinima: config.reservaContingenciaMinima,
      diasRestantesHastaIngreso: diasRestantes
    });

    // 5. Cascada de cuotas T+1 a T+12
    const cascada = ProyectorCascadaCuotas.proyectar(
      cuotasPendientes,
      config.ingresoBaseEstimadoMensual,
      fechaActual
    );

    return {
      safeToSpend,
      cascadaCuotas: cascada,
      totalLiquidezARS: Number(totalLiquidezARS.toFixed(2)),
      totalReservaUSD: Number(totalReservaUSD.toFixed(2)),
      totalReservaInvertidaUSD: Number(totalReservaInvertidaUSD.toFixed(2)),
      totalDesahorroMesActual: Number(desahorroMes.toFixed(2)),
      deudaTarjetasCicloActual: Number(deudaTarjetasTotalCiclo.toFixed(2))
    };
  }

  /**
   * Simulador What-If antes de realizar una nueva compra con cuotas.
   */
  public async simularNuevaCompra(
    config: ParametrosConfiguracionTesoreria,
    montoTotal: number,
    cantidadCuotas: number,
    fechaActual: Date = new Date()
  ): Promise<SimulacionCompraWhatIf> {
    const cuotasPendientes = await this.repoPlanesCuotas.obtenerCuotasPendientes();
    return ProyectorCascadaCuotas.simularNuevaCompra(
      cuotasPendientes,
      config.ingresoBaseEstimadoMensual,
      montoTotal,
      cantidadCuotas,
      fechaActual
    );
  }
}
