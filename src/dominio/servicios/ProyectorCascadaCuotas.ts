/**
 * Servicio de Dominio: ProyectorCascadaCuotas
 * Proyecta la deuda comprometida a 12 meses (T+1 .. T+12) y evalúa el ratio de endeudamiento.
 */

import { CronogramaCuota } from '../modelos/PlanCuotas.js';

export interface MesProyeccion {
  mesCiclo: string; // 'YYYY-MM'
  montoCuotasComprometidas: number;
  ratioEndeudamiento: number; // Monto / IngresoBase
  superaUmbralCritico: boolean; // Ratio > 0.35
}

export interface ResultadoProyeccionCascada {
  meses: MesProyeccion[];
  deudaTotalComprometida12Meses: number;
  mesMayorCompromiso: MesProyeccion;
  ratioMaximo: number;
  alertaRiesgoGlobal: boolean;
}

export interface SimulacionCompraWhatIf {
  montoTotal: number;
  cantidadCuotas: number;
  esViable: boolean;
  mesesAfectadosConAlerta: string[];
  mensajeDiagnostico: string;
}

export class ProyectorCascadaCuotas {
  public static readonly UMBRAL_CRITICO_RATIO = 0.35; // 35% del ingreso base

  /**
   * Genera la lista ordenada de los próximos 12 ciclos mensuales a partir de una fecha de referencia.
   */
  public static obtenerProximos12Meses(fechaReferencia: Date = new Date()): string[] {
    const meses: string[] = [];
    const fecha = new Date(fechaReferencia);

    for (let i = 1; i <= 12; i++) {
      const proximo = new Date(fecha.getFullYear(), fecha.getMonth() + i, 1);
      const año = proximo.getFullYear();
      const mes = String(proximo.getMonth() + 1).padStart(2, '0');
      meses.push(`${año}-${mes}`);
    }

    return meses;
  }

  /**
   * Proyecta el pasivo de cuotas ya asumido para los meses T+1 a T+12.
   */
  public static proyectar(
    cuotasPendientes: CronogramaCuota[],
    ingresoBaseEstimado: number,
    fechaReferencia: Date = new Date()
  ): ResultadoProyeccionCascada {
    const proximosMeses = this.obtenerProximos12Meses(fechaReferencia);
    const agregacionPorMes = new Map<string, number>();

    // Inicializar mapa de 12 meses en cero
    for (const mes of proximosMeses) {
      agregacionPorMes.set(mes, 0);
    }

    // Sumar cuotas existentes
    for (const cuota of cuotasPendientes) {
      if (cuota.estado === 'PENDIENTE' && agregacionPorMes.has(cuota.mes_ciclo_facturacion)) {
        const actual = agregacionPorMes.get(cuota.mes_ciclo_facturacion) || 0;
        agregacionPorMes.set(cuota.mes_ciclo_facturacion, actual + cuota.monto_cuota);
      }
    }

    let deudaTotal = 0;
    let ratioMax = 0;
    let mesPico: MesProyeccion = {
      mesCiclo: proximosMeses[0],
      montoCuotasComprometidas: 0,
      ratioEndeudamiento: 0,
      superaUmbralCritico: false
    };

    const mesesProyectados: MesProyeccion[] = [];

    for (const mes of proximosMeses) {
      const montoMes = Number((agregacionPorMes.get(mes) || 0).toFixed(2));
      deudaTotal += montoMes;

      const ratio = ingresoBaseEstimado > 0 
        ? Number((montoMes / ingresoBaseEstimado).toFixed(4))
        : 0;

      const supera = ratio > this.UMBRAL_CRITICO_RATIO;

      const item: MesProyeccion = {
        mesCiclo: mes,
        montoCuotasComprometidas: montoMes,
        ratioEndeudamiento: ratio,
        superaUmbralCritico: supera
      };

      if (ratio > ratioMax) {
        ratioMax = ratio;
        mesPico = item;
      }

      mesesProyectados.push(item);
    }

    return {
      meses: mesesProyectados,
      deudaTotalComprometida12Meses: Number(deudaTotal.toFixed(2)),
      mesMayorCompromiso: mesPico,
      ratioMaximo: ratioMax,
      alertaRiesgoGlobal: ratioMax > this.UMBRAL_CRITICO_RATIO
    };
  }

  /**
   * Simulador What-If: Evalúa si contraer una nueva compra en N cuotas
   * provocaría un desborde del límite del 35% en los próximos ciclos.
   */
  public static simularNuevaCompra(
    cuotasPendientesActuales: CronogramaCuota[],
    ingresoBaseEstimado: number,
    montoTotalNuevaCompra: number,
    cantidadCuotas: number,
    fechaReferencia: Date = new Date()
  ): SimulacionCompraWhatIf {
    if (cantidadCuotas <= 0) {
      throw new Error('La cantidad de cuotas debe ser mayor a 0');
    }

    const valorCuotaNueva = Number((montoTotalNuevaCompra / cantidadCuotas).toFixed(2));
    const proximosMeses = this.obtenerProximos12Meses(fechaReferencia);
    
    // Proyección base actual
    const base = this.proyectar(cuotasPendientesActuales, ingresoBaseEstimado, fechaReferencia);

    const mesesConAlerta: string[] = [];

    for (let i = 0; i < cantidadCuotas && i < proximosMeses.length; i++) {
      const mes = proximosMeses[i];
      const compromisoPrevio = base.meses.find(m => m.mesCiclo === mes)?.montoCuotasComprometidas || 0;
      const compromisoSimulado = compromisoPrevio + valorCuotaNueva;
      const ratioSimulado = ingresoBaseEstimado > 0 ? compromisoSimulado / ingresoBaseEstimado : 0;

      if (ratioSimulado > this.UMBRAL_CRITICO_RATIO) {
        mesesConAlerta.push(mes);
      }
    }

    const esViable = mesesConAlerta.length === 0;

    let mensaje = esViable
      ? `Compra viable: La cuota mensual de $${valorCuotaNueva.toLocaleString('es-AR')} mantiene el endeudamiento por debajo del 35%.`
      : `Bloqueo preventivo: Esta compra superaría el límite de seguridad (35%) en los meses: ${mesesConAlerta.join(', ')}.`;

    return {
      montoTotal: montoTotalNuevaCompra,
      cantidadCuotas,
      esViable,
      mesesAfectadosConAlerta: mesesConAlerta,
      mensajeDiagnostico: mensaje
    };
  }
}
