/**
 * RepositorioMiembrosSqlite
 * Implementación SQLite de IRepositorioMiembros.
 */

import { IRepositorioMiembros } from '../../dominio/repositorios/IRepositorioMiembros.js';
import { MiembroFamilia, RolMiembroFamilia, miembroPoseeTarjeta } from '../../dominio/modelos/MiembroFamilia.js';
import { BovedaSqlite } from './BovedaSqlite.js';

interface FilaMiembro {
  id: string;
  nombre: string;
  rol: string;
  digitos_tarjetas_asignadas: string;
  techo_presupuesto_mensual: number | null;
  categorias_autorizadas: string | null;
}

export class RepositorioMiembrosSqlite implements IRepositorioMiembros {
  constructor(private readonly boveda: BovedaSqlite) {}

  private mapearFilaAMiembro(fila: FilaMiembro): MiembroFamilia {
    let tarjetas: string[] = [];
    let categorias: string[] | undefined = undefined;

    try {
      tarjetas = JSON.parse(fila.digitos_tarjetas_asignadas);
    } catch {
      tarjetas = [];
    }

    if (fila.categorias_autorizadas) {
      try {
        categorias = JSON.parse(fila.categorias_autorizadas);
      } catch {
        categorias = [];
      }
    }

    return {
      id: fila.id,
      nombre: fila.nombre,
      rol: fila.rol as RolMiembroFamilia,
      digitos_tarjetas_asignadas: tarjetas,
      techo_presupuesto_mensual: fila.techo_presupuesto_mensual !== null ? Number(fila.techo_presupuesto_mensual) : undefined,
      categorias_autorizadas: categorias
    };
  }

  public async obtenerTodos(): Promise<MiembroFamilia[]> {
    const db = this.boveda.obtenerBase();
    const filas = db.prepare('SELECT * FROM miembros_familia').all() as unknown as FilaMiembro[];
    return filas.map(f => this.mapearFilaAMiembro(f));
  }

  public async obtenerPorId(id: string): Promise<MiembroFamilia | null> {
    const db = this.boveda.obtenerBase();
    const fila = db.prepare('SELECT * FROM miembros_familia WHERE id = ?').get(id) as unknown as FilaMiembro | undefined;
    return fila ? this.mapearFilaAMiembro(fila) : null;
  }

  public async obtenerPorDigitosTarjeta(ultimosCuatro: string): Promise<MiembroFamilia | null> {
    const todos = await this.obtenerTodos();
    return todos.find(m => miembroPoseeTarjeta(m, ultimosCuatro)) ?? null;
  }

  public async guardar(miembro: MiembroFamilia): Promise<void> {
    const db = this.boveda.obtenerBase();
    const stmt = db.prepare(`
      INSERT INTO miembros_familia (
        id, nombre, rol, digitos_tarjetas_asignadas,
        techo_presupuesto_mensual, categorias_autorizadas
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        nombre = excluded.nombre,
        rol = excluded.rol,
        digitos_tarjetas_asignadas = excluded.digitos_tarjetas_asignadas,
        techo_presupuesto_mensual = excluded.techo_presupuesto_mensual,
        categorias_autorizadas = excluded.categorias_autorizadas
    `);

    stmt.run(
      miembro.id,
      miembro.nombre,
      miembro.rol,
      JSON.stringify(miembro.digitos_tarjetas_asignadas ?? []),
      miembro.techo_presupuesto_mensual ?? null,
      miembro.categorias_autorizadas ? JSON.stringify(miembro.categorias_autorizadas) : null
    );
  }

  public async eliminar(id: string): Promise<void> {
    const db = this.boveda.obtenerBase();
    const stmt = db.prepare('DELETE FROM miembros_familia WHERE id = ?');
    stmt.run(id);
  }
}
