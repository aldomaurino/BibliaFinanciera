import { PlanCuotas, CronogramaCuota } from '../modelos/PlanCuotas.js';

export interface IRepositorioPlanesCuotas {
  guardarPlanConCuotas(plan: PlanCuotas, cuotas: CronogramaCuota[]): Promise<void>;
  obtenerCuotasPendientes(hastaMesCiclo?: string): Promise<CronogramaCuota[]>;
  obtenerPlanesPorTarjeta(idTarjeta: string): Promise<PlanCuotas[]>;
  marcarCuotaComoFacturada(idCuota: string): Promise<void>;
}
