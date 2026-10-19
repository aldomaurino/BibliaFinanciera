/**
 * RepositorioCompromisosMensualesSqlite
 * Implementación SQLite de IRepositorioCompromisosMensuales.
 */

import { IRepositorioCompromisosMensuales } from '../../dominio/repositorios/IRepositorioCompromisosMensuales.js';
import { CompromisoMensual } from '../../dominio/modelos/CompromisoMensual.js';
import { EstadoCompromiso } from '../../dominio/modelos/CompromisoFijo.js';
import { TipoMoneda } from '../../dominio/modelos/Cuenta.js';

import { BovedaSqlite } from './BovedaSqlite.js';
import crypto from 'node:crypto';

interface FilaCompromisoMensual {
  id: string;
  id_cuenta_debito: string;
  mes_ciclo: string;
  nombre: string;
  categoria: string;
  monto: number;
  moneda: string;
  dia_vencimiento_estimado: number;
  fecha_vencimiento: string;
  estado: string;
  fecha_pago: string | null;
  es_recurrente: number;
  actualizado_en: string;
}

export class RepositorioCompromisosMensualesSqlite implements IRepositorioCompromisosMensuales {
  constructor(private readonly boveda: BovedaSqlite) {}

  private mapearFila(fila: FilaCompromisoMensual): CompromisoMensual {
    return {
      id: fila.id,
      id_cuenta_debito: fila.id_cuenta_debito,
      mes_ciclo: fila.mes_ciclo,
      nombre: fila.nombre,
      categoria: fila.categoria,
      monto: Number(fila.monto),
      moneda: fila.moneda as TipoMoneda,
      dia_vencimiento_estimado: Number(fila.dia_vencimiento_estimado),
      fecha_vencimiento: fila.fecha_vencimiento,
      estado: fila.estado as EstadoCompromiso,
      fecha_pago: fila.fecha_pago || undefined,
      es_recurrente: Boolean(fila.es_recurrente),
      actualizado_en: fila.actualizado_en
    };
  }

  public async obtenerPorMes(mesCiclo: string): Promise<CompromisoMensual[]> {
    const db = this.boveda.obtenerBase();
    const filas = db.prepare(`
      SELECT * FROM compromisos_mensuales
      WHERE mes_ciclo = ?
      ORDER BY fecha_vencimiento ASC, dia_vencimiento_estimado ASC
    `).all(mesCiclo) as unknown as FilaCompromisoMensual[];

    return filas.map(f => this.mapearFila(f));
  }

  public async obtenerPorMesYCuenta(mesCiclo: string, idCuenta: string): Promise<CompromisoMensual[]> {
    const db = this.boveda.obtenerBase();
    const filas = db.prepare(`
      SELECT * FROM compromisos_mensuales
      WHERE mes_ciclo = ? AND id_cuenta_debito = ?
      ORDER BY fecha_vencimiento ASC, dia_vencimiento_estimado ASC
    `).all(mesCiclo, idCuenta) as unknown as FilaCompromisoMensual[];

    return filas.map(f => this.mapearFila(f));
  }

  public async obtenerPorId(id: string): Promise<CompromisoMensual | null> {
    const db = this.boveda.obtenerBase();
    const fila = db.prepare('SELECT * FROM compromisos_mensuales WHERE id = ?').get(id) as unknown as FilaCompromisoMensual | undefined;
    return fila ? this.mapearFila(fila) : null;
  }

  public async guardar(compromiso: CompromisoMensual): Promise<void> {
    const db = this.boveda.obtenerBase();
    const ahoraIso = compromiso.actualizado_en || new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO compromisos_mensuales (
        id, id_cuenta_debito, mes_ciclo, nombre, categoria, monto, moneda,
        dia_vencimiento_estimado, fecha_vencimiento, estado, fecha_pago,
        es_recurrente, actualizado_en
      ) VALUES (
        @id, @id_cuenta_debito, @mes_ciclo, @nombre, @categoria, @monto, @moneda,
        @dia_vencimiento_estimado, @fecha_vencimiento, @estado, @fecha_pago,
        @es_recurrente, @actualizado_en
      )
      ON CONFLICT(id) DO UPDATE SET
        id_cuenta_debito = excluded.id_cuenta_debito,
        mes_ciclo = excluded.mes_ciclo,
        nombre = excluded.nombre,
        categoria = excluded.categoria,
        monto = excluded.monto,
        moneda = excluded.moneda,
        dia_vencimiento_estimado = excluded.dia_vencimiento_estimado,
        fecha_vencimiento = excluded.fecha_vencimiento,
        estado = excluded.estado,
        fecha_pago = excluded.fecha_pago,
        es_recurrente = excluded.es_recurrente,
        actualizado_en = excluded.actualizado_en
    `);

    stmt.run({
      id: compromiso.id,
      id_cuenta_debito: compromiso.id_cuenta_debito,
      mes_ciclo: compromiso.mes_ciclo,
      nombre: compromiso.nombre,
      categoria: compromiso.categoria,
      monto: compromiso.monto,
      moneda: compromiso.moneda,
      dia_vencimiento_estimado: compromiso.dia_vencimiento_estimado,
      fecha_vencimiento: compromiso.fecha_vencimiento,
      estado: compromiso.estado,
      fecha_pago: compromiso.fecha_pago ?? null,
      es_recurrente: compromiso.es_recurrente ? 1 : 0,
      actualizado_en: ahoraIso
    });
  }

  public async actualizarMontoYVencimiento(
    id: string,
    monto: number,
    fechaVencimiento: string,
    diaEstimado?: number
  ): Promise<void> {
    const db = this.boveda.obtenerBase();
    const ahoraIso = new Date().toISOString();

    // Extraer día si no se pasa explícitamente
    const dia = diaEstimado ?? (fechaVencimiento ? parseInt(fechaVencimiento.split('-')[2], 10) : 1);

    const stmt = db.prepare(`
      UPDATE compromisos_mensuales
      SET monto = ?, fecha_vencimiento = ?, dia_vencimiento_estimado = ?, actualizado_en = ?
      WHERE id = ?
    `);

    stmt.run(monto, fechaVencimiento, dia, ahoraIso, id);
  }

  public async marcarComoPagado(id: string, pagado: boolean, fechaPago?: string): Promise<void> {
    const db = this.boveda.obtenerBase();
    const ahoraIso = new Date().toISOString();
    const estado: EstadoCompromiso = pagado ? 'PAGADO' : 'PENDIENTE';
    const pagoFecha = pagado ? (fechaPago ?? ahoraIso.slice(0, 10)) : null;

    const stmt = db.prepare(`
      UPDATE compromisos_mensuales
      SET estado = ?, fecha_pago = ?, actualizado_en = ?
      WHERE id = ?
    `);

    stmt.run(estado, pagoFecha, ahoraIso, id);
  }

  public async eliminar(id: string): Promise<void> {
    const db = this.boveda.obtenerBase();
    db.prepare('DELETE FROM compromisos_mensuales WHERE id = ?').run(id);
  }

  public async obtenerMesesDisponibles(): Promise<string[]> {
    const db = this.boveda.obtenerBase();
    const filas = db.prepare(`
      SELECT DISTINCT mes_ciclo FROM compromisos_mensuales
      ORDER BY mes_ciclo DESC
    `).all() as Array<{ mes_ciclo: string }>;

    return filas.map(f => f.mes_ciclo);
  }

  public async clonarRecurrentesDeMes(mesOrigen: string, mesDestino: string): Promise<number> {
    const db = this.boveda.obtenerBase();
    const compromisosOrigen = await this.obtenerPorMes(mesOrigen);
    const recurrentes = compromisosOrigen.filter(c => c.es_recurrente);
    const compromisosDestinoExistentes = await this.obtenerPorMes(mesDestino);

    let insertados = 0;
    const ahoraIso = new Date().toISOString();

    this.boveda.transaccion((db) => {
      const stmt = db.prepare(`
        INSERT INTO compromisos_mensuales (
          id, id_cuenta_debito, mes_ciclo, nombre, categoria, monto, moneda,
          dia_vencimiento_estimado, fecha_vencimiento, estado, fecha_pago,
          es_recurrente, actualizado_en
        ) VALUES (
          @id, @id_cuenta_debito, @mes_ciclo, @nombre, @categoria, @monto, @moneda,
          @dia_vencimiento_estimado, @fecha_vencimiento, @estado, @fecha_pago,
          @es_recurrente, @actualizado_en
        )
      `);

      for (const orig of recurrentes) {
        // Verificar si ya existe uno con mismo nombre y cuenta en el mes destino
        const yaExiste = compromisosDestinoExistentes.some(
          d => d.id_cuenta_debito === orig.id_cuenta_debito && d.nombre.trim().toLowerCase() === orig.nombre.trim().toLowerCase()
        );

        if (!yaExiste) {
          // Calcular fecha de vencimiento ajustada al nuevo mes
          const dia = String(orig.dia_vencimiento_estimado).padStart(2, '0');
          const nuevaFechaVencimiento = `${mesDestino}-${dia}`;
          const nuevoId = `comp-${mesDestino}-${crypto.randomUUID().slice(0, 8)}`;

          stmt.run({
            id: nuevoId,
            id_cuenta_debito: orig.id_cuenta_debito,
            mes_ciclo: mesDestino,
            nombre: orig.nombre,
            categoria: orig.categoria,
            monto: 0, // Inicia en 0 para que el usuario cargue el nuevo monto del mes
            moneda: orig.moneda,
            dia_vencimiento_estimado: orig.dia_vencimiento_estimado,
            fecha_vencimiento: nuevaFechaVencimiento,
            estado: 'PENDIENTE',
            fecha_pago: null,
            es_recurrente: 1,
            actualizado_en: ahoraIso
          });
          insertados++;
        }
      }
    });

    return insertados;
  }

  public async obtenerTodos(): Promise<CompromisoMensual[]> {
    const db = this.boveda.obtenerBase();
    const filas = db.prepare(`
      SELECT * FROM compromisos_mensuales
      ORDER BY mes_ciclo DESC, fecha_vencimiento ASC
    `).all() as unknown as FilaCompromisoMensual[];

    return filas.map(f => this.mapearFila(f));
  }

  public async reemplazarLote(compromisos: CompromisoMensual[]): Promise<void> {
    this.boveda.transaccion(() => {
      for (const comp of compromisos) {
        this.guardar(comp);
      }
    });
  }
}
