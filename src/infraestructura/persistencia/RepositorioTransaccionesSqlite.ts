/**
 * RepositorioTransaccionesSqlite
 * Implementación SQLite de IRepositorioTransacciones.
 */

import { IRepositorioTransacciones, FiltrosTransaccion } from '../../dominio/repositorios/IRepositorioTransacciones.js';
import {
  Transaccion,
  EstadoTransaccion,
  TipoTransaccion,
  NivelRigidez
} from '../../dominio/modelos/Transaccion.js';
import { TipoMoneda } from '../../dominio/modelos/Cuenta.js';
import { BovedaSqlite } from './BovedaSqlite.js';

interface FilaTransaccion {
  id: string;
  id_cuenta_origen: string | null;
  id_tarjeta_credito: string | null;
  id_miembro_familia: string;
  fecha_transaccion: string;
  fecha_compensacion: string | null;
  monto: number;
  moneda: string;
  tipo_cambio: number | null;
  tipo_transaccion: string;
  nivel_rigidez: string;
  categoria: string;
  comercio: string;
  estado: string;
  hash_conciliacion: string | null;
}

export class RepositorioTransaccionesSqlite implements IRepositorioTransacciones {
  constructor(private readonly boveda: BovedaSqlite) {}

  private mapearFilaATransaccion(fila: FilaTransaccion): Transaccion {
    return {
      id: fila.id,
      id_cuenta_origen: fila.id_cuenta_origen ?? undefined,
      id_tarjeta_credito: fila.id_tarjeta_credito ?? undefined,
      id_miembro_familia: fila.id_miembro_familia,
      fecha_transaccion: new Date(fila.fecha_transaccion),
      fecha_compensacion: fila.fecha_compensacion ? new Date(fila.fecha_compensacion) : undefined,
      monto: Number(fila.monto),
      moneda: fila.moneda as TipoMoneda,
      tipo_cambio: fila.tipo_cambio !== null ? Number(fila.tipo_cambio) : undefined,
      tipo_transaccion: fila.tipo_transaccion as TipoTransaccion,
      nivel_rigidez: fila.nivel_rigidez as NivelRigidez,
      categoria: fila.categoria,
      comercio: fila.comercio,
      estado: fila.estado as EstadoTransaccion,
      hash_conciliacion: fila.hash_conciliacion ?? undefined
    };
  }

  public async guardar(transaccion: Transaccion): Promise<void> {
    const db = this.boveda.obtenerBase();
    const stmt = db.prepare(`
      INSERT INTO transacciones (
        id, id_cuenta_origen, id_tarjeta_credito, id_miembro_familia,
        fecha_transaccion, fecha_compensacion, monto, moneda, tipo_cambio,
        tipo_transaccion, nivel_rigidez, categoria, comercio, estado, hash_conciliacion
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        id_cuenta_origen = excluded.id_cuenta_origen,
        id_tarjeta_credito = excluded.id_tarjeta_credito,
        id_miembro_familia = excluded.id_miembro_familia,
        fecha_transaccion = excluded.fecha_transaccion,
        fecha_compensacion = excluded.fecha_compensacion,
        monto = excluded.monto,
        moneda = excluded.moneda,
        tipo_cambio = excluded.tipo_cambio,
        tipo_transaccion = excluded.tipo_transaccion,
        nivel_rigidez = excluded.nivel_rigidez,
        categoria = excluded.categoria,
        comercio = excluded.comercio,
        estado = excluded.estado,
        hash_conciliacion = excluded.hash_conciliacion
    `);

    stmt.run(
      transaccion.id,
      transaccion.id_cuenta_origen ?? null,
      transaccion.id_tarjeta_credito ?? null,
      transaccion.id_miembro_familia,
      transaccion.fecha_transaccion.toISOString(),
      transaccion.fecha_compensacion ? transaccion.fecha_compensacion.toISOString() : null,
      transaccion.monto,
      transaccion.moneda,
      transaccion.tipo_cambio ?? null,
      transaccion.tipo_transaccion,
      transaccion.nivel_rigidez,
      transaccion.categoria,
      transaccion.comercio,
      transaccion.estado,
      transaccion.hash_conciliacion ?? null
    );
  }

  public async obtenerPorId(id: string): Promise<Transaccion | null> {
    const db = this.boveda.obtenerBase();
    const fila = db.prepare('SELECT * FROM transacciones WHERE id = ?').get(id) as unknown as FilaTransaccion | undefined;
    return fila ? this.mapearFilaATransaccion(fila) : null;
  }

  public async obtenerTodas(filtros?: FiltrosTransaccion): Promise<Transaccion[]> {
    const db = this.boveda.obtenerBase();
    const clausulas: string[] = [];
    const parametros: (string | number)[] = [];

    if (filtros?.estado) {
      clausulas.push('estado = ?');
      parametros.push(filtros.estado);
    }
    if (filtros?.idMiembroFamilia) {
      clausulas.push('id_miembro_familia = ?');
      parametros.push(filtros.idMiembroFamilia);
    }
    if (filtros?.idTarjetaCredito) {
      clausulas.push('id_tarjeta_credito = ?');
      parametros.push(filtros.idTarjetaCredito);
    }
    if (filtros?.idCuentaOrigen) {
      clausulas.push('id_cuenta_origen = ?');
      parametros.push(filtros.idCuentaOrigen);
    }
    if (filtros?.desde) {
      clausulas.push('fecha_transaccion >= ?');
      parametros.push(filtros.desde.toISOString());
    }
    if (filtros?.hasta) {
      clausulas.push('fecha_transaccion <= ?');
      parametros.push(filtros.hasta.toISOString());
    }

    const whereSql = clausulas.length > 0 ? `WHERE ${clausulas.join(' AND ')}` : '';
    const sql = `SELECT * FROM transacciones ${whereSql} ORDER BY fecha_transaccion DESC`;

    const filas = db.prepare(sql).all(...parametros) as unknown as FilaTransaccion[];
    return filas.map(f => this.mapearFilaATransaccion(f));
  }

  public async obtenerProvisorias(): Promise<Transaccion[]> {
    return this.obtenerTodas({ estado: 'PROVISORIO' });
  }

  public async actualizarEstado(id: string, nuevoEstado: EstadoTransaccion, fechaCompensacion?: Date): Promise<void> {
    const db = this.boveda.obtenerBase();
    if (fechaCompensacion) {
      const stmt = db.prepare('UPDATE transacciones SET estado = ?, fecha_compensacion = ? WHERE id = ?');
      stmt.run(nuevoEstado, fechaCompensacion.toISOString(), id);
    } else {
      const stmt = db.prepare('UPDATE transacciones SET estado = ? WHERE id = ?');
      stmt.run(nuevoEstado, id);
    }
  }

  public async buscarPorHashConciliacion(hash: string): Promise<Transaccion | null> {
    const db = this.boveda.obtenerBase();
    const fila = db.prepare('SELECT * FROM transacciones WHERE hash_conciliacion = ?').get(hash) as unknown as FilaTransaccion | undefined;
    return fila ? this.mapearFilaATransaccion(fila) : null;
  }
}
