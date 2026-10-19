import { MiembroFamilia } from '../modelos/MiembroFamilia.js';

export interface IRepositorioMiembros {
  obtenerTodos(): Promise<MiembroFamilia[]>;
  obtenerPorId(id: string): Promise<MiembroFamilia | null>;
  obtenerPorDigitosTarjeta(ultimosCuatro: string): Promise<MiembroFamilia | null>;
  guardar(miembro: MiembroFamilia): Promise<void>;
  eliminar(id: string): Promise<void>;
}
