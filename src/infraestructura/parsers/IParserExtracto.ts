/**
 * IParserExtracto
 * Interfaz unificada para parsers de extractos bancarios y resúmenes de tarjetas.
 */

import { LineaExtractoOficial } from '../../dominio/servicios/MotorMatchingHeuristico.js';

export type TipoOrigenExtracto = 'CUENTA_BANCARIA' | 'TARJETA_CREDITO';

export interface ResumenPlasticoIndividual {
  ultimosCuatroDigitos: string;
  nombreTitular: string;
  totalPesos: number;
  totalDolares: number;
}

export interface CuotaProyeccionResumen {
  mesCiclo: string; // 'YYYY-MM'
  monto: number;
}

export interface InfoExtractoParseado {
  bancoOEmisor: string;
  marcaTarjeta?: 'VISA' | 'AMEX' | 'MASTERCARD' | 'TUYA' | 'CABAL' | 'MERCADO_PAGO';
  tipo: TipoOrigenExtracto;
  ultimosCuatroDigitos?: string;
  fechaCierre?: Date;
  fechaVencimiento?: Date;
  saldoPesos?: number;
  saldoDolares?: number;
  saldoFinalCuenta?: number;
  plasticos?: ResumenPlasticoIndividual[];
  proyeccionCuotas?: CuotaProyeccionResumen[];
  lineas: LineaExtractoOficial[];
}

export interface IParserExtracto {
  puedeProcesar(contenido: string): boolean;
  parsear(contenido: string, ultimosDigitosPorDefecto?: string): InfoExtractoParseado;
}
