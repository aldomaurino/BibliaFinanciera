/**
 * RepositorioCuentasSqlite
 * Implementación SQLite de IRepositorioCuentas.
 */

import { IRepositorioCuentas } from '../../dominio/repositorios/IRepositorioCuentas.js';
import { Cuenta, TipoCuenta, TipoMoneda, IdentificadoresCuenta, cuentaPoseeIdentificador } from '../../dominio/modelos/Cuenta.js';
import { BovedaSqlite } from './BovedaSqlite.js';

interface FilaCuenta {
  id: string;
  nombre: string;
  tipo_cuenta: string;
  moneda: string;
  saldo_actual: number;
  identificadores_cuenta: string;
  es_reserva: number;
}

export class RepositorioCuentasSqlite implements IRepositorioCuentas {
  constructor(private readonly boveda: BovedaSqlite) {}

  private mapearFilaACuenta(fila: FilaCuenta): Cuenta {
    let identificadores: IdentificadoresCuenta = {};
    try {
      identificadores = JSON.parse(fila.identificadores_cuenta);
    } catch {
      identificadores = {};
    }

    return {
      id: fila.id,
      nombre: fila.nombre,
      tipo_cuenta: fila.tipo_cuenta as TipoCuenta,
      moneda: fila.moneda as TipoMoneda,
      saldo_actual: Number(fila.saldo_actual),
      identificadores_cuenta: identificadores,
      es_reserva: Boolean(fila.es_reserva)
    };
  }

  public async obtenerTodas(): Promise<Cuenta[]> {
    const db = this.boveda.obtenerBase();
    const filas = db.prepare('SELECT * FROM cuentas').all() as unknown as FilaCuenta[];
    return filas.map(f => this.mapearFilaACuenta(f));
  }

  public async obtenerPorId(id: string): Promise<Cuenta | null> {
    const db = this.boveda.obtenerBase();
    const fila = db.prepare('SELECT * FROM cuentas WHERE id = ?').get(id) as unknown as FilaCuenta | undefined;
    return fila ? this.mapearFilaACuenta(fila) : null;
  }

  public async guardar(cuenta: Cuenta): Promise<void> {
    const db = this.boveda.obtenerBase();
    const stmt = db.prepare(`
      INSERT INTO cuentas (id, nombre, tipo_cuenta, moneda, saldo_actual, identificadores_cuenta, es_reserva)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        nombre = excluded.nombre,
        tipo_cuenta = excluded.tipo_cuenta,
        moneda = excluded.moneda,
        saldo_actual = excluded.saldo_actual,
        identificadores_cuenta = excluded.identificadores_cuenta,
        es_reserva = excluded.es_reserva
    `);

    stmt.run(
      cuenta.id,
      cuenta.nombre,
      cuenta.tipo_cuenta,
      cuenta.moneda,
      cuenta.saldo_actual,
      JSON.stringify(cuenta.identificadores_cuenta),
      cuenta.es_reserva ? 1 : 0
    );
  }

  public async actualizarSaldo(id: string, nuevoSaldo: number): Promise<void> {
    const db = this.boveda.obtenerBase();
    const stmt = db.prepare('UPDATE cuentas SET saldo_actual = ? WHERE id = ?');
    stmt.run(nuevoSaldo, id);
  }

  public async buscarPorIdentificador(cbuCvuAlias: string): Promise<Cuenta | null> {
    const todas = await this.obtenerTodas();
    return todas.find(c => cuentaPoseeIdentificador(c, cbuCvuAlias)) ?? null;
  }

  public async eliminar(id: string): Promise<void> {
    const db = this.boveda.obtenerBase();
    const stmt = db.prepare('DELETE FROM cuentas WHERE id = ?');
    stmt.run(id);
  }
}
