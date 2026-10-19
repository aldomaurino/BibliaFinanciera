/**
 * IRepositorioCompromisosMensuales
 * Contrato de persistencia para el seguimiento mensual y fondeo por banco.
 */

import { CompromisoMensual } from '../modelos/CompromisoMensual.js';

export interface IRepositorioCompromisosMensuales {
  obtenerPorMes(mesCiclo: string): Promise<CompromisoMensual[]>;
  obtenerPorMesYCuenta(mesCiclo: string, idCuenta: string): Promise<CompromisoMensual[]>;
  obtenerPorId(id: string): Promise<CompromisoMensual | null>;
  guardar(compromiso: CompromisoMensual): Promise<void>;
  actualizarMontoYVencimiento(id: string, monto: number, fechaVencimiento: string, diaEstimado?: number): Promise<void>;
  marcarComoPagado(id: string, pagado: boolean, fechaPago?: string): Promise<void>;
  eliminar(id: string): Promise<void>;
  obtenerMesesDisponibles(): Promise<string[]>;
  clonarRecurrentesDeMes(mesOrigen: string, mesDestino: string): Promise<number>;
  obtenerTodos(): Promise<CompromisoMensual[]>;
  reemplazarLote(compromisos: CompromisoMensual[]): Promise<void>;
}
