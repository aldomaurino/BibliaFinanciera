/**
 * RepositorioTarjetasSqlite
 * Implementación SQLite de IRepositorioTarjetas.
 */

import { IRepositorioTarjetas } from '../../dominio/repositorios/IRepositorioTarjetas.js';
import { TarjetaCredito, MarcaTarjeta, coincideUltimosDigitos } from '../../dominio/modelos/TarjetaCredito.js';
import { BovedaSqlite } from './BovedaSqlite.js';

interface FilaTarjeta {
  id: string;
  banco_emisor: string;
  marca_tarjeta: string;
  ultimos_cuatro_digitos: string;
  dia_cierre_resumen: number;
  dia_vencimiento_pago: number;
  id_cuenta_liquidacion: string;
  fecha_cierre_actual: string | null;
  fecha_vencimiento_actual: string | null;
  saldo_pesos_resumen: number | null;
  saldo_dolares_resumen: number | null;
}

export class RepositorioTarjetasSqlite implements IRepositorioTarjetas {
  constructor(private readonly boveda: BovedaSqlite) {}

  private mapearFilaATarjeta(fila: FilaTarjeta): TarjetaCredito {
    return {
      id: fila.id,
      banco_emisor: fila.banco_emisor,
      marca_tarjeta: fila.marca_tarjeta as MarcaTarjeta,
      ultimos_cuatro_digitos: fila.ultimos_cuatro_digitos,
      dia_cierre_resumen: Number(fila.dia_cierre_resumen),
      dia_vencimiento_pago: Number(fila.dia_vencimiento_pago),
      id_cuenta_liquidacion: fila.id_cuenta_liquidacion,
      fecha_cierre_actual: fila.fecha_cierre_actual ? new Date(fila.fecha_cierre_actual) : undefined,
      fecha_vencimiento_actual: fila.fecha_vencimiento_actual ? new Date(fila.fecha_vencimiento_actual) : undefined,
      saldo_pesos_resumen: fila.saldo_pesos_resumen !== null ? Number(fila.saldo_pesos_resumen) : undefined,
      saldo_dolares_resumen: fila.saldo_dolares_resumen !== null ? Number(fila.saldo_dolares_resumen) : undefined
    };
  }

  public async obtenerTodas(): Promise<TarjetaCredito[]> {
    const db = this.boveda.obtenerBase();
    const filas = db.prepare('SELECT * FROM tarjetas_credito').all() as unknown as FilaTarjeta[];
    return filas.map(f => this.mapearFilaATarjeta(f));
  }

  public async obtenerPorId(id: string): Promise<TarjetaCredito | null> {
    const db = this.boveda.obtenerBase();
    const fila = db.prepare('SELECT * FROM tarjetas_credito WHERE id = ?').get(id) as unknown as FilaTarjeta | undefined;
    return fila ? this.mapearFilaATarjeta(fila) : null;
  }

  public async obtenerPorUltimosDigitos(ultimosCuatro: string): Promise<TarjetaCredito | null> {
    const todas = await this.obtenerTodas();
    return todas.find(t => coincideUltimosDigitos(t, ultimosCuatro)) ?? null;
  }

  public async guardar(tarjeta: TarjetaCredito): Promise<void> {
    const db = this.boveda.obtenerBase();
    const stmt = db.prepare(`
      INSERT INTO tarjetas_credito (
        id, banco_emisor, marca_tarjeta, ultimos_cuatro_digitos,
        dia_cierre_resumen, dia_vencimiento_pago, id_cuenta_liquidacion,
        fecha_cierre_actual, fecha_vencimiento_actual, saldo_pesos_resumen, saldo_dolares_resumen
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        banco_emisor = excluded.banco_emisor,
        marca_tarjeta = excluded.marca_tarjeta,
        ultimos_cuatro_digitos = excluded.ultimos_cuatro_digitos,
        dia_cierre_resumen = excluded.dia_cierre_resumen,
        dia_vencimiento_pago = excluded.dia_vencimiento_pago,
        id_cuenta_liquidacion = excluded.id_cuenta_liquidacion,
        fecha_cierre_actual = excluded.fecha_cierre_actual,
        fecha_vencimiento_actual = excluded.fecha_vencimiento_actual,
        saldo_pesos_resumen = excluded.saldo_pesos_resumen,
        saldo_dolares_resumen = excluded.saldo_dolares_resumen
    `);

    stmt.run(
      tarjeta.id,
      tarjeta.banco_emisor,
      tarjeta.marca_tarjeta,
      tarjeta.ultimos_cuatro_digitos,
      tarjeta.dia_cierre_resumen,
      tarjeta.dia_vencimiento_pago,
      tarjeta.id_cuenta_liquidacion,
      tarjeta.fecha_cierre_actual ? tarjeta.fecha_cierre_actual.toISOString() : null,
      tarjeta.fecha_vencimiento_actual ? tarjeta.fecha_vencimiento_actual.toISOString() : null,
      tarjeta.saldo_pesos_resumen ?? null,
      tarjeta.saldo_dolares_resumen ?? null
    );
  }

  public async eliminar(id: string): Promise<void> {
    const db = this.boveda.obtenerBase();
    const stmt = db.prepare('DELETE FROM tarjetas_credito WHERE id = ?');
    stmt.run(id);
  }
}
