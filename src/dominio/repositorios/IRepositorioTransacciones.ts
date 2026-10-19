import { Transaccion, EstadoTransaccion } from '../modelos/Transaccion.js';

export interface FiltrosTransaccion {
  estado?: EstadoTransaccion;
  idMiembroFamilia?: string;
  idTarjetaCredito?: string;
  idCuentaOrigen?: string;
  desde?: Date;
  hasta?: Date;
}

export interface IRepositorioTransacciones {
  guardar(transaccion: Transaccion): Promise<void>;
  obtenerPorId(id: string): Promise<Transaccion | null>;
  obtenerTodas(filtros?: FiltrosTransaccion): Promise<Transaccion[]>;
  obtenerProvisorias(): Promise<Transaccion[]>;
  actualizarEstado(id: string, nuevoEstado: EstadoTransaccion, fechaCompensacion?: Date): Promise<void>;
  buscarPorHashConciliacion(hash: string): Promise<Transaccion | null>;
}
