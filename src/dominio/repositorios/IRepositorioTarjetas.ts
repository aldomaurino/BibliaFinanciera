import { TarjetaCredito } from '../modelos/TarjetaCredito.js';

export interface IRepositorioTarjetas {
  obtenerTodas(): Promise<TarjetaCredito[]>;
  obtenerPorId(id: string): Promise<TarjetaCredito | null>;
  obtenerPorUltimosDigitos(ultimosCuatro: string): Promise<TarjetaCredito | null>;
  guardar(tarjeta: TarjetaCredito): Promise<void>;
  eliminar(id: string): Promise<void>;
}
