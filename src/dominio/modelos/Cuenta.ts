/**
 * Entidad Cuenta
 * Representa una cuenta bancaria, billetera virtual o caja de efectivo físico.
 */

export type TipoCuenta = 
  | 'CUENTA_CORRIENTE'
  | 'CAJA_AHORRO'
  | 'BILLETERA_VIRTUAL'
  | 'CAJA_EFECTIVO';

export type TipoMoneda = 'ARS' | 'USD';

export interface IdentificadoresCuenta {
  cbus?: string[];
  cvus?: string[];
  alias?: string[];
  cuits?: string[];
}

export interface Cuenta {
  id: string;
  nombre: string;
  tipo_cuenta: TipoCuenta;
  moneda: TipoMoneda;
  saldo_actual: number;
  identificadores_cuenta: IdentificadoresCuenta;
  es_reserva?: boolean; // Para inversiones o reservas bloqueadas que no deben contarse como liquidez diaria
}

/**
 * Validador para determinar si un CBU, CVU o Alias pertenece a esta cuenta propia.
 */
export function cuentaPoseeIdentificador(cuenta: Cuenta, identificadorBuscado: string): boolean {
  const normalizado = identificadorBuscado.trim().toUpperCase();
  const ids = cuenta.identificadores_cuenta;

  if (ids.alias?.some(a => a.trim().toUpperCase() === normalizado)) return true;
  if (ids.cbus?.some(c => c.trim() === identificadorBuscado.trim())) return true;
  if (ids.cvus?.some(c => c.trim() === identificadorBuscado.trim())) return true;
  if (ids.cuits?.some(c => c.trim() === identificadorBuscado.trim())) return true;

  return false;
}
