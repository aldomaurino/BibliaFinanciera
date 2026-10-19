/**
 * Entidad CompromisoFijo (Débitos Automáticos y Compromisos Recurrentes)
 * Modela expensas, seguros, educación, servicios que impactan en la necesidad de fondeo bancario.
 */

import { TipoMoneda } from './Cuenta.js';

export type EstadoCompromiso = 'PENDIENTE' | 'PAGADO';

export interface CompromisoFijo {
  id: string;
  nombre: string; // ej. "Expensas BsAs", "Facultad", "ARCA"
  monto: number;
  moneda: TipoMoneda;
  id_cuenta_debito: string; // FK a Cuentas (Santander, NBCH, etc.)
  dia_vencimiento_estimado: number; // 1 - 31
  categoria: string;
  estado: EstadoCompromiso;
}
