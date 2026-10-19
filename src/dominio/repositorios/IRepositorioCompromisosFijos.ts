/**
 * IRepositorioCompromisosFijos
 * Contrato de persistencia para débitos y pagos recurrentes.
 */

import { CompromisoFijo } from '../modelos/CompromisoFijo.js';

export interface IRepositorioCompromisosFijos {
  obtenerTodos(): Promise<CompromisoFijo[]>;
  obtenerPorCuenta(idCuenta: string): Promise<CompromisoFijo[]>;
  obtenerPendientes(): Promise<CompromisoFijo[]>;
  guardar(compromiso: CompromisoFijo): Promise<void>;
  marcarComoPagado(id: string, pagado: boolean): Promise<void>;
  eliminar(id: string): Promise<void>;
}
