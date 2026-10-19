/**
 * Entidad TarjetaCredito
 * Representa los plásticos de crédito emitidos por entidades bancarias o fintechs.
 */

export type MarcaTarjeta = 
  | 'VISA'
  | 'MASTERCARD'
  | 'CABAL'
  | 'AMEX'
  | 'TUYA'
  | 'MERCADO_PAGO';

export interface TarjetaCredito {
  id: string;
  banco_emisor: string;
  marca_tarjeta: MarcaTarjeta;
  ultimos_cuatro_digitos: string; // ej. "4589"
  dia_cierre_resumen: number; // 1 - 31
  dia_vencimiento_pago: number; // 1 - 31 (valor de referencia base)
  id_cuenta_liquidacion: string; // FK a Cuentas
  fecha_cierre_actual?: Date; // Extraído dinámicamente del último resumen procesado
  fecha_vencimiento_actual?: Date; // Extraído dinámicamente del último resumen procesado
  saldo_pesos_resumen?: number; // Saldo total en ARS a pagar del último resumen
  saldo_dolares_resumen?: number; // Saldo total en USD a pagar del último resumen
}

/**
 * Validador para comprobar si una transacción coincide con los últimos 4 dígitos.
 */
export function coincideUltimosDigitos(tarjeta: TarjetaCredito, digitos: string): boolean {
  if (!digitos) return false;
  const limpio = digitos.replace(/\D/g, '');
  return tarjeta.ultimos_cuatro_digitos === limpio || tarjeta.ultimos_cuatro_digitos.endsWith(limpio);
}
