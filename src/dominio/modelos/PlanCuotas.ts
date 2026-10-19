/**
 * Entidades PlanCuotas y CronogramaCuotas
 * Modelado de deuda diferida para la cascada T+1 .. T+12.
 */

export type EstadoCuota = 'PENDIENTE' | 'FACTURADO';

export interface CronogramaCuota {
  id: string;
  id_plan_cuotas: string;
  numero_cuota: number;
  monto_cuota: number;
  mes_ciclo_facturacion: string; // Formato YYYY-MM
  estado: EstadoCuota;
}

export interface PlanCuotas {
  id: string;
  id_tarjeta_credito: string;
  id_miembro_familia: string;
  descripcion: string;
  monto_total: number;
  total_cuotas: number;
  fecha_inicio: Date;
  cuotas?: CronogramaCuota[];
}

/**
 * Genera el desglose de cuotas para un plan nuevo a partir de una fecha de inicio y día de corte.
 */
export function generarDesgloseCuotas(
  idPlan: string,
  montoTotal: number,
  totalCuotas: number,
  fechaInicio: Date,
  diaCorteResumen: number
): CronogramaCuota[] {
  if (totalCuotas <= 0) throw new Error('La cantidad de cuotas debe ser mayor a 0');
  
  const montoPorCuota = Number((montoTotal / totalCuotas).toFixed(2));
  const cuotas: CronogramaCuota[] = [];
  
  let fechaCursor = new Date(fechaInicio);

  // Si la compra se hace después del día de corte, la primera cuota entra en el ciclo del mes siguiente
  if (fechaCursor.getDate() >= diaCorteResumen) {
    fechaCursor.setMonth(fechaCursor.getMonth() + 1);
  }

  for (let i = 1; i <= totalCuotas; i++) {
    const año = fechaCursor.getFullYear();
    const mes = String(fechaCursor.getMonth() + 1).padStart(2, '0');
    const mesCiclo = `${año}-${mes}`;

    // Ajuste de centavos en la última cuota para cuadratura exacta
    let montoCuotaActual = montoPorCuota;
    if (i === totalCuotas) {
      const sumaPrevia = montoPorCuota * (totalCuotas - 1);
      montoCuotaActual = Number((montoTotal - sumaPrevia).toFixed(2));
    }

    cuotas.push({
      id: `${idPlan}_cuota_${i}`,
      id_plan_cuotas: idPlan,
      numero_cuota: i,
      monto_cuota: montoCuotaActual,
      mes_ciclo_facturacion: mesCiclo,
      estado: 'PENDIENTE'
    });

    // Avanzamos un mes para la siguiente cuota
    fechaCursor.setMonth(fechaCursor.getMonth() + 1);
  }

  return cuotas;
}
