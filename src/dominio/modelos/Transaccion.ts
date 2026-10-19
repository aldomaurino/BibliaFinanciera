/**
 * Entidad Transaccion (Libro Mayor Unificado)
 * Modela todo movimiento de fondos según los principios dogmáticos del sistema.
 */

import { TipoMoneda } from './Cuenta.js';

export type TipoTransaccion = 
  | 'GASTO'
  | 'INGRESO_GENUINO'
  | 'TRANSFERENCIA_INTERNA'
  | 'RECUPERO_CAPITAL'
  | 'RESCATE_DESAHORRO';

export type NivelRigidez = 
  | 'INFLEXIBLE'
  | 'OPERATIVO_ELASTICO'
  | 'DISCRECIONAL';

export type EstadoTransaccion = 
  | 'PROVISORIO'
  | 'CONFIRMADO';

export interface Transaccion {
  id: string;
  id_cuenta_origen?: string | null;
  id_tarjeta_credito?: string | null;
  id_miembro_familia: string;
  fecha_transaccion: Date;
  fecha_compensacion?: Date | null;
  monto: number;
  moneda: TipoMoneda;
  tipo_cambio?: number | null;
  tipo_transaccion: TipoTransaccion;
  nivel_rigidez: NivelRigidez;
  categoria: string;
  comercio: string;
  estado: EstadoTransaccion;
  hash_conciliacion?: string | null;
}

/**
 * Genera un identificador único de conciliación (hash) para evitar duplicados.
 */
export function generarHashConciliacion(
  fecha: Date,
  monto: number,
  comercio: string,
  ultimosCuatroDigitos?: string
): string {
  const f = fecha.toISOString().split('T')[0];
  const m = monto.toFixed(2);
  const c = comercio.trim().toUpperCase().replace(/\s+/g, '_');
  const d = ultimosCuatroDigitos ? ultimosCuatroDigitos.trim() : 'NO_CARD';
  return `${f}_${m}_${c}_${d}`;
}
