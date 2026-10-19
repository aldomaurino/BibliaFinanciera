import { Cuenta } from '../modelos/Cuenta.js';

export interface IRepositorioCuentas {
  obtenerTodas(): Promise<Cuenta[]>;
  obtenerPorId(id: string): Promise<Cuenta | null>;
  guardar(cuenta: Cuenta): Promise<void>;
  actualizarSaldo(id: string, nuevoSaldo: number): Promise<void>;
  buscarPorIdentificador(cbuCvuAlias: string): Promise<Cuenta | null>;
  eliminar(id: string): Promise<void>;
}
