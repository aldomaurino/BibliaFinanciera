import { IRepositorioCuentas } from '../../src/dominio/repositorios/IRepositorioCuentas.js';
import { IRepositorioTarjetas } from '../../src/dominio/repositorios/IRepositorioTarjetas.js';
import { IRepositorioMiembros } from '../../src/dominio/repositorios/IRepositorioMiembros.js';
import { IRepositorioTransacciones, FiltrosTransaccion } from '../../src/dominio/repositorios/IRepositorioTransacciones.js';
import { IRepositorioPlanesCuotas } from '../../src/dominio/repositorios/IRepositorioPlanesCuotas.js';

import { Cuenta, cuentaPoseeIdentificador } from '../../src/dominio/modelos/Cuenta.js';
import { TarjetaCredito } from '../../src/dominio/modelos/TarjetaCredito.js';
import { MiembroFamilia } from '../../src/dominio/modelos/MiembroFamilia.js';
import { Transaccion, EstadoTransaccion } from '../../src/dominio/modelos/Transaccion.js';
import { PlanCuotas, CronogramaCuota } from '../../src/dominio/modelos/PlanCuotas.js';

export class RepositorioCuentasEnMemoria implements IRepositorioCuentas {
  public cuentas: Cuenta[] = [];

  async obtenerTodas(): Promise<Cuenta[]> {
    return [...this.cuentas];
  }
  async obtenerPorId(id: string): Promise<Cuenta | null> {
    return this.cuentas.find(c => c.id === id) || null;
  }
  async guardar(cuenta: Cuenta): Promise<void> {
    const idx = this.cuentas.findIndex(c => c.id === cuenta.id);
    if (idx >= 0) this.cuentas[idx] = cuenta;
    else this.cuentas.push(cuenta);
  }
  async actualizarSaldo(id: string, nuevoSaldo: number): Promise<void> {
    const c = this.cuentas.find(item => item.id === id);
    if (c) c.saldo_actual = nuevoSaldo;
  }
  async buscarPorIdentificador(identificador: string): Promise<Cuenta | null> {
    return this.cuentas.find(c => cuentaPoseeIdentificador(c, identificador)) || null;
  }
  async eliminar(id: string): Promise<void> {
    this.cuentas = this.cuentas.filter(c => c.id !== id);
  }
}

export class RepositorioTarjetasEnMemoria implements IRepositorioTarjetas {
  public tarjetas: TarjetaCredito[] = [];

  async obtenerTodas(): Promise<TarjetaCredito[]> {
    return [...this.tarjetas];
  }
  async obtenerPorId(id: string): Promise<TarjetaCredito | null> {
    return this.tarjetas.find(t => t.id === id) || null;
  }
  async obtenerPorUltimosDigitos(ultimosCuatro: string): Promise<TarjetaCredito | null> {
    return this.tarjetas.find(t => t.ultimos_cuatro_digitos === ultimosCuatro) || null;
  }
  async guardar(tarjeta: TarjetaCredito): Promise<void> {
    const idx = this.tarjetas.findIndex(t => t.id === tarjeta.id);
    if (idx >= 0) this.tarjetas[idx] = tarjeta;
    else this.tarjetas.push(tarjeta);
  }
  async eliminar(id: string): Promise<void> {
    this.tarjetas = this.tarjetas.filter(t => t.id !== id);
  }
}

export class RepositorioMiembrosEnMemoria implements IRepositorioMiembros {
  public miembros: MiembroFamilia[] = [];

  async obtenerTodos(): Promise<MiembroFamilia[]> {
    return [...this.miembros];
  }
  async obtenerPorId(id: string): Promise<MiembroFamilia | null> {
    return this.miembros.find(m => m.id === id) || null;
  }
  async obtenerPorDigitosTarjeta(ultimosCuatro: string): Promise<MiembroFamilia | null> {
    return this.miembros.find(m => m.digitos_tarjetas_asignadas.includes(ultimosCuatro)) || null;
  }
  async guardar(miembro: MiembroFamilia): Promise<void> {
    const idx = this.miembros.findIndex(m => m.id === miembro.id);
    if (idx >= 0) this.miembros[idx] = miembro;
    else this.miembros.push(miembro);
  }
  async eliminar(id: string): Promise<void> {
    this.miembros = this.miembros.filter(m => m.id !== id);
  }
}

export class RepositorioTransaccionesEnMemoria implements IRepositorioTransacciones {
  public transacciones: Transaccion[] = [];

  async guardar(transaccion: Transaccion): Promise<void> {
    const idx = this.transacciones.findIndex(t => t.id === transaccion.id);
    if (idx >= 0) this.transacciones[idx] = transaccion;
    else this.transacciones.push(transaccion);
  }
  async obtenerPorId(id: string): Promise<Transaccion | null> {
    return this.transacciones.find(t => t.id === id) || null;
  }
  async obtenerTodas(filtros?: FiltrosTransaccion): Promise<Transaccion[]> {
    let res = [...this.transacciones];
    if (filtros?.estado) res = res.filter(t => t.estado === filtros.estado);
    if (filtros?.idMiembroFamilia) res = res.filter(t => t.id_miembro_familia === filtros.idMiembroFamilia);
    if (filtros?.idTarjetaCredito) res = res.filter(t => t.id_tarjeta_credito === filtros.idTarjetaCredito);
    return res;
  }
  async obtenerProvisorias(): Promise<Transaccion[]> {
    return this.transacciones.filter(t => t.estado === 'PROVISORIO');
  }
  async actualizarEstado(id: string, nuevoEstado: EstadoTransaccion, fechaCompensacion?: Date): Promise<void> {
    const tx = this.transacciones.find(t => t.id === id);
    if (tx) {
      tx.estado = nuevoEstado;
      if (fechaCompensacion) tx.fecha_compensacion = fechaCompensacion;
    }
  }
  async buscarPorHashConciliacion(hash: string): Promise<Transaccion | null> {
    return this.transacciones.find(t => t.hash_conciliacion === hash) || null;
  }
}

export class RepositorioPlanesCuotasEnMemoria implements IRepositorioPlanesCuotas {
  public planes: PlanCuotas[] = [];
  public cuotas: CronogramaCuota[] = [];

  async guardarPlanConCuotas(plan: PlanCuotas, cuotas: CronogramaCuota[]): Promise<void> {
    this.planes.push(plan);
    this.cuotas.push(...cuotas);
  }
  async obtenerCuotasPendientes(hastaMesCiclo?: string): Promise<CronogramaCuota[]> {
    return this.cuotas.filter(c => {
      if (c.estado !== 'PENDIENTE') return false;
      if (hastaMesCiclo && c.mes_ciclo_facturacion > hastaMesCiclo) return false;
      return true;
    });
  }
  async obtenerPlanesPorTarjeta(idTarjeta: string): Promise<PlanCuotas[]> {
    return this.planes.filter(p => p.id_tarjeta_credito === idTarjeta);
  }
  async marcarCuotaComoFacturada(idCuota: string): Promise<void> {
    const c = this.cuotas.find(item => item.id === idCuota);
    if (c) c.estado = 'FACTURADO';
  }
}
