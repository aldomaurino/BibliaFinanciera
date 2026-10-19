/**
 * RepositorioCompromisosFijosSqlite
 * Implementación SQLite de IRepositorioCompromisosFijos.
 */

import { IRepositorioCompromisosFijos } from '../../dominio/repositorios/IRepositorioCompromisosFijos.js';
import { CompromisoFijo, EstadoCompromiso } from '../../dominio/modelos/CompromisoFijo.js';
import { TipoMoneda } from '../../dominio/modelos/Cuenta.js';
import { BovedaSqlite } from './BovedaSqlite.js';

interface FilaCompromiso {
  id: string;
  nombre: string;
  monto: number;
  moneda: string;
  id_cuenta_debito: string;
  dia_vencimiento_estimado: number;
  categoria: string;
  estado: string;
}

export class RepositorioCompromisosFijosSqlite implements IRepositorioCompromisosFijos {
  constructor(private readonly boveda: BovedaSqlite) {}

  private mapearFila(fila: FilaCompromiso): CompromisoFijo {
    return {
      id: fila.id,
      nombre: fila.nombre,
      monto: Number(fila.monto),
      moneda: fila.moneda as TipoMoneda,
      id_cuenta_debito: fila.id_cuenta_debito,
      dia_vencimiento_estimado: Number(fila.dia_vencimiento_estimado),
      categoria: fila.categoria,
      estado: fila.estado as EstadoCompromiso
    };
  }

  public async obtenerTodos(): Promise<CompromisoFijo[]> {
    const db = this.boveda.obtenerBase();
    const filas = db.prepare('SELECT * FROM compromisos_fijos ORDER BY dia_vencimiento_estimado ASC').all() as unknown as FilaCompromiso[];
    return filas.map(f => this.mapearFila(f));
  }

  public async obtenerPorCuenta(idCuenta: string): Promise<CompromisoFijo[]> {
    const db = this.boveda.obtenerBase();
    const filas = db.prepare('SELECT * FROM compromisos_fijos WHERE id_cuenta_debito = ? ORDER BY dia_vencimiento_estimado ASC').all(idCuenta) as unknown as FilaCompromiso[];
    return filas.map(f => this.mapearFila(f));
  }

  public async obtenerPendientes(): Promise<CompromisoFijo[]> {
    const db = this.boveda.obtenerBase();
    const filas = db.prepare("SELECT * FROM compromisos_fijos WHERE estado = 'PENDIENTE' ORDER BY dia_vencimiento_estimado ASC").all() as unknown as FilaCompromiso[];
    return filas.map(f => this.mapearFila(f));
  }

  public async guardar(compromiso: CompromisoFijo): Promise<void> {
    const db = this.boveda.obtenerBase();
    const stmt = db.prepare(`
      INSERT INTO compromisos_fijos (
        id, nombre, monto, moneda, id_cuenta_debito,
        dia_vencimiento_estimado, categoria, estado
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        nombre = excluded.nombre,
        monto = excluded.monto,
        moneda = excluded.moneda,
        id_cuenta_debito = excluded.id_cuenta_debito,
        dia_vencimiento_estimado = excluded.dia_vencimiento_estimado,
        categoria = excluded.categoria,
        estado = excluded.estado
    `);

    stmt.run(
      compromiso.id,
      compromiso.nombre,
      compromiso.monto,
      compromiso.moneda,
      compromiso.id_cuenta_debito,
      compromiso.dia_vencimiento_estimado,
      compromiso.categoria,
      compromiso.estado
    );
  }

  public async marcarComoPagado(id: string, pagado: boolean): Promise<void> {
    const db = this.boveda.obtenerBase();
    const stmt = db.prepare('UPDATE compromisos_fijos SET estado = ? WHERE id = ?');
    stmt.run(pagado ? 'PAGADO' : 'PENDIENTE', id);
  }

  public async eliminar(id: string): Promise<void> {
    const db = this.boveda.obtenerBase();
    const stmt = db.prepare('DELETE FROM compromisos_fijos WHERE id = ?');
    stmt.run(id);
  }
}
