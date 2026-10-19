/**
 * RepositorioPlanesCuotasSqlite
 * Implementación SQLite de IRepositorioPlanesCuotas.
 */

import { IRepositorioPlanesCuotas } from '../../dominio/repositorios/IRepositorioPlanesCuotas.js';
import { PlanCuotas, CronogramaCuota, EstadoCuota } from '../../dominio/modelos/PlanCuotas.js';
import { BovedaSqlite } from './BovedaSqlite.js';

interface FilaPlan {
  id: string;
  id_tarjeta_credito: string;
  id_miembro_familia: string;
  descripcion: string;
  monto_total: number;
  total_cuotas: number;
  fecha_inicio: string;
}

interface FilaCuota {
  id: string;
  id_plan_cuotas: string;
  numero_cuota: number;
  monto_cuota: number;
  mes_ciclo_facturacion: string;
  estado: string;
}

export class RepositorioPlanesCuotasSqlite implements IRepositorioPlanesCuotas {
  constructor(private readonly boveda: BovedaSqlite) {}

  private mapearFilaACuota(fila: FilaCuota): CronogramaCuota {
    return {
      id: fila.id,
      id_plan_cuotas: fila.id_plan_cuotas,
      numero_cuota: Number(fila.numero_cuota),
      monto_cuota: Number(fila.monto_cuota),
      mes_ciclo_facturacion: fila.mes_ciclo_facturacion,
      estado: fila.estado as EstadoCuota
    };
  }

  private mapearFilaAPlan(fila: FilaPlan, cuotas?: CronogramaCuota[]): PlanCuotas {
    return {
      id: fila.id,
      id_tarjeta_credito: fila.id_tarjeta_credito,
      id_miembro_familia: fila.id_miembro_familia,
      descripcion: fila.descripcion,
      monto_total: Number(fila.monto_total),
      total_cuotas: Number(fila.total_cuotas),
      fecha_inicio: new Date(fila.fecha_inicio),
      cuotas
    };
  }

  public async guardarPlanConCuotas(plan: PlanCuotas, cuotas: CronogramaCuota[]): Promise<void> {
    this.boveda.transaccion((db) => {
      const stmtPlan = db.prepare(`
        INSERT INTO planes_cuotas (
          id, id_tarjeta_credito, id_miembro_familia,
          descripcion, monto_total, total_cuotas, fecha_inicio
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          id_tarjeta_credito = excluded.id_tarjeta_credito,
          id_miembro_familia = excluded.id_miembro_familia,
          descripcion = excluded.descripcion,
          monto_total = excluded.monto_total,
          total_cuotas = excluded.total_cuotas,
          fecha_inicio = excluded.fecha_inicio
      `);

      stmtPlan.run(
        plan.id,
        plan.id_tarjeta_credito,
        plan.id_miembro_familia,
        plan.descripcion,
        plan.monto_total,
        plan.total_cuotas,
        plan.fecha_inicio.toISOString()
      );

      const stmtCuota = db.prepare(`
        INSERT INTO cronograma_cuotas (
          id, id_plan_cuotas, numero_cuota, monto_cuota,
          mes_ciclo_facturacion, estado
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          numero_cuota = excluded.numero_cuota,
          monto_cuota = excluded.monto_cuota,
          mes_ciclo_facturacion = excluded.mes_ciclo_facturacion,
          estado = excluded.estado
      `);

      for (const cuota of cuotas) {
        stmtCuota.run(
          cuota.id,
          cuota.id_plan_cuotas,
          cuota.numero_cuota,
          cuota.monto_cuota,
          cuota.mes_ciclo_facturacion,
          cuota.estado
        );
      }
    });
  }

  public async obtenerCuotasPendientes(hastaMesCiclo?: string): Promise<CronogramaCuota[]> {
    const db = this.boveda.obtenerBase();
    if (hastaMesCiclo) {
      const stmt = db.prepare(`
        SELECT * FROM cronograma_cuotas 
        WHERE estado = 'PENDIENTE' AND mes_ciclo_facturacion <= ?
        ORDER BY mes_ciclo_facturacion ASC, numero_cuota ASC
      `);
      const filas = stmt.all(hastaMesCiclo) as unknown as FilaCuota[];
      return filas.map(f => this.mapearFilaACuota(f));
    } else {
      const stmt = db.prepare(`
        SELECT * FROM cronograma_cuotas 
        WHERE estado = 'PENDIENTE'
        ORDER BY mes_ciclo_facturacion ASC, numero_cuota ASC
      `);
      const filas = stmt.all() as unknown as FilaCuota[];
      return filas.map(f => this.mapearFilaACuota(f));
    }
  }

  public async obtenerPlanesPorTarjeta(idTarjeta: string): Promise<PlanCuotas[]> {
    const db = this.boveda.obtenerBase();
    const stmtPlanes = db.prepare('SELECT * FROM planes_cuotas WHERE id_tarjeta_credito = ?');
    const filasPlanes = stmtPlanes.all(idTarjeta) as unknown as FilaPlan[];

    const planes: PlanCuotas[] = [];
    const stmtCuotas = db.prepare('SELECT * FROM cronograma_cuotas WHERE id_plan_cuotas = ? ORDER BY numero_cuota ASC');

    for (const fPlan of filasPlanes) {
      const filasCuotas = stmtCuotas.all(fPlan.id) as unknown as FilaCuota[];
      const cuotas = filasCuotas.map(c => this.mapearFilaACuota(c));
      planes.push(this.mapearFilaAPlan(fPlan, cuotas));
    }

    return planes;
  }

  public async marcarCuotaComoFacturada(idCuota: string): Promise<void> {
    const db = this.boveda.obtenerBase();
    const stmt = db.prepare("UPDATE cronograma_cuotas SET estado = 'FACTURADO' WHERE id = ?");
    stmt.run(idCuota);
  }
}
