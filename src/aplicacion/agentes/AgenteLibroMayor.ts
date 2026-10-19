/**
 * Agente 2: Agente de Libro Mayor y Conciliación
 * Ejecuta las reglas dogmáticas del sistema sobre el libro mayor unificado.
 */

import { Transaccion, generarHashConciliacion, TipoTransaccion, NivelRigidez } from '../../dominio/modelos/Transaccion.js';
import { IRepositorioTransacciones } from '../../dominio/repositorios/IRepositorioTransacciones.js';
import { IRepositorioCuentas } from '../../dominio/repositorios/IRepositorioCuentas.js';
import { IRepositorioTarjetas } from '../../dominio/repositorios/IRepositorioTarjetas.js';
import { IRepositorioMiembros } from '../../dominio/repositorios/IRepositorioMiembros.js';
import { MotorMatchingHeuristico, LineaExtractoOficial, ResultadoMatching } from '../../dominio/servicios/MotorMatchingHeuristico.js';
import { cuentaPoseeIdentificador } from '../../dominio/modelos/Cuenta.js';

export interface ResultadoProcesamientoExtracto {
  lineasProcesadas: number;
  transaccionesConfirmadasFusionadas: Transaccion[];
  transaccionesNuevasInsertadas: Transaccion[];
  totalDebitos: number;
  totalCreditos: number;
  totalMontoProcesado: number;
}

export class AgenteLibroMayor {
  constructor(
    private readonly repoTransacciones: IRepositorioTransacciones,
    private readonly repoCuentas: IRepositorioCuentas,
    private readonly repoTarjetas: IRepositorioTarjetas,
    private readonly repoMiembros: IRepositorioMiembros
  ) {}

  /**
   * Procesa una transferencia y aplica la regla de Traspaso Neutro si es entre cuentas propias.
   */
  public async procesarTransferencia(
    idCuentaOrigen: string,
    cbuCvuAliasDestino: string,
    monto: number,
    idMiembroFamilia: string,
    fecha: Date = new Date()
  ): Promise<Transaccion> {
    const cuentas = await this.repoCuentas.obtenerTodas();
    const cuentaDestinoPropia = cuentas.find(c => cuentaPoseeIdentificador(c, cbuCvuAliasDestino));

    const esNeutro = !!cuentaDestinoPropia;

    const tx: Transaccion = {
      id: crypto.randomUUID(),
      id_cuenta_origen: idCuentaOrigen,
      id_miembro_familia: idMiembroFamilia,
      fecha_transaccion: fecha,
      fecha_compensacion: fecha,
      monto,
      moneda: 'ARS',
      tipo_transaccion: esNeutro ? 'TRANSFERENCIA_INTERNA' : 'GASTO',
      nivel_rigidez: 'INFLEXIBLE',
      categoria: esNeutro ? 'Transferencia Interna' : 'Transferencia a Tercero',
      comercio: esNeutro ? `Traspaso a ${cuentaDestinoPropia.nombre}` : `Transferencia a ${cbuCvuAliasDestino}`,
      estado: 'CONFIRMADO',
      hash_conciliacion: generarHashConciliacion(fecha, monto, cbuCvuAliasDestino)
    };

    await this.repoTransacciones.guardar(tx);
    return tx;
  }

  /**
   * Procesa una venta de divisas (arbitraje de USD a ARS para cubrir caja).
   * Aplica la regla dogmática de RESCATE_DESAHORRO.
   */
  public async registrarVentaDivisas(
    idCuentaUSD: string,
    idCuentaARS: string,
    montoUSD: number,
    montoARSObtenido: number,
    tipoCambio: number,
    idMiembroFamilia: string,
    fecha: Date = new Date()
  ): Promise<Transaccion> {
    const tx: Transaccion = {
      id: crypto.randomUUID(),
      id_cuenta_origen: idCuentaUSD,
      id_miembro_familia: idMiembroFamilia,
      fecha_transaccion: fecha,
      fecha_compensacion: fecha,
      monto: montoARSObtenido,
      moneda: 'ARS',
      tipo_cambio: tipoCambio,
      tipo_transaccion: 'RESCATE_DESAHORRO', // Irrevocable
      nivel_rigidez: 'INFLEXIBLE',
      categoria: 'Rescate de Capital por Déficit',
      comercio: 'Liquidación de USD / Arbitraje',
      estado: 'CONFIRMADO',
      hash_conciliacion: generarHashConciliacion(fecha, montoARSObtenido, 'VENTA_USD')
    };

    await this.repoTransacciones.guardar(tx);
    return tx;
  }

  /**
   * Procesa un lote de extracto bancario o resumen de tarjeta,
   * ejecutando el algoritmo de Matching Heurístico de Extractos y
   * aplicando filtros determinísticos de Débitos vs Créditos y Centros de Costo.
   */
  public async conciliarLoteExtracto(
    lineas: LineaExtractoOficial[],
    idTarjetaOpcional?: string,
    idCuentaOpcional?: string,
    tipoExtracto?: 'CUENTA_BANCARIA' | 'TARJETA_CREDITO'
  ): Promise<ResultadoProcesamientoExtracto> {
    const provisorias = await this.repoTransacciones.obtenerProvisorias();
    const tarjetas = await this.repoTarjetas.obtenerTodas();
    const miembros = await this.repoMiembros.obtenerTodos();

    const mapaDigitosTarjetas = new Map<string, string>();
    for (const t of tarjetas) {
      mapaDigitosTarjetas.set(t.id, t.ultimos_cuatro_digitos);
    }

    const confirmadasFusionadas: Transaccion[] = [];
    const nuevasInsertadas: Transaccion[] = [];
    let totalMonto = 0;
    let totalDebitos = 0;
    let totalCreditos = 0;

    for (const linea of lineas) {
      const esDebito = linea.es_debito !== false;
      if (esDebito) {
        totalDebitos += linea.monto;
      } else {
        totalCreditos += linea.monto;
      }
      totalMonto += linea.monto;

      // Buscar matching heurístico contra transacciones provisorias
      const mejorMatch: ResultadoMatching | null = MotorMatchingHeuristico.buscarMejorCoincidencia(
        provisorias,
        linea,
        mapaDigitosTarjetas
      );

      if (mejorMatch && mejorMatch.esCoincidenciaConfirmada && mejorMatch.transaccionProvisoriaOriginal) {
        // MATCH >= 0.85: Se consolida en CONFIRMADO reteniendo categoría y miembro
        const original = mejorMatch.transaccionProvisoriaOriginal;
        await this.repoTransacciones.actualizarEstado(original.id, 'CONFIRMADO', linea.fecha);
        original.estado = 'CONFIRMADO';
        original.fecha_compensacion = linea.fecha;
        confirmadasFusionadas.push(original);

        // Remover de la lista en memoria para no volver a matchear la misma
        const idx = provisorias.findIndex(p => p.id === original.id);
        if (idx !== -1) provisorias.splice(idx, 1);
      } else {
        // MATCH < 0.85: Inserción de nuevo registro CONFIRMADO.
        const descMin = (linea.comercio_crudo || '').toLowerCase();

        let tipoTransaccion: TipoTransaccion = 'GASTO';
        let nivelRigidez: NivelRigidez = 'OPERATIVO_ELASTICO';
        let categoria = tipoExtracto === 'TARJETA_CREDITO' ? 'Consumo Tarjeta Crédito' : 'Consumo Bancario';

        if (!esDebito) {
          // --- CRÉDITOS (Entrada de dinero) ---
          if (descMin.includes('haberes') || descMin.includes('sueldo') || descMin.includes('honorarios')) {
            tipoTransaccion = 'INGRESO_GENUINO';
            categoria = 'Sueldos y Haberes';
            nivelRigidez = 'INFLEXIBLE';
          } else if (
            descMin.includes('mismo titular') ||
            descMin.includes('online banking propia') ||
            descMin.includes('propia') ||
            descMin.includes('aldo ezequiel maurino') ||
            descMin.includes('aldo exequiel maurino')
          ) {
            tipoTransaccion = 'TRANSFERENCIA_INTERNA';
            categoria = 'Transferencia Entre Cuentas Propias';
            nivelRigidez = 'OPERATIVO_ELASTICO';
          } else if (
            descMin.includes('liquidacion titulos') ||
            descMin.includes('inversion') ||
            descMin.includes('plazo fijo') ||
            descMin.includes('rescate') ||
            descMin.includes('venta divisas') ||
            descMin.includes('arbitraje')
          ) {
            // Regla dogmática: Intercepción de Desahorro
            tipoTransaccion = 'RESCATE_DESAHORRO';
            categoria = 'Liquidación de Inversiones / Desahorro';
            nivelRigidez = 'INFLEXIBLE';
          } else if (descMin.includes('devolucion') || descMin.includes('reintegro') || descMin.includes('anulacion')) {
            tipoTransaccion = 'INGRESO_GENUINO';
            categoria = 'Reintegros y Devoluciones';
            nivelRigidez = 'OPERATIVO_ELASTICO';
          } else if (descMin.includes('pago interes') || descMin.includes('interes')) {
            tipoTransaccion = 'INGRESO_GENUINO';
            categoria = 'Intereses Cobrados';
            nivelRigidez = 'OPERATIVO_ELASTICO';
          } else {
            tipoTransaccion = 'INGRESO_GENUINO';
            categoria = 'Transferencia Recibida';
            nivelRigidez = 'OPERATIVO_ELASTICO';
          }
        } else {
          // --- DÉBITOS (Salidas de dinero / Gastos) ---
          if (
            descMin.includes('pago de tarjeta') ||
            descMin.includes('pago tarjeta') ||
            descMin.includes('pago resumen') ||
            descMin.includes('debito tarjeta')
          ) {
            // Regla dogmática: Pago de tarjeta desde banco es transferencia interna para no duplicar consumos
            tipoTransaccion = 'TRANSFERENCIA_INTERNA';
            categoria = 'Pago Resumen Tarjeta';
            nivelRigidez = 'INFLEXIBLE';
          } else if (descMin.includes('uca.edu.ar') || descMin.includes('facultad') || descMin.includes('universidad') || descMin.includes('colegio')) {
            tipoTransaccion = 'GASTO';
            categoria = 'Educación y Universidad';
            nivelRigidez = 'INFLEXIBLE';
          } else if (descMin.includes('edesur') || descMin.includes('luz') || descMin.includes('gas') || descMin.includes('metrogas') || descMin.includes('aysa') || descMin.includes('telecom') || descMin.includes('fibertel') || descMin.includes('personal')) {
            tipoTransaccion = 'GASTO';
            categoria = 'Servicios Básicos';
            nivelRigidez = 'INFLEXIBLE';
          } else if (descMin.includes('bayresmadero') || descMin.includes('complejo residencial') || descMin.includes('expensas') || descMin.includes('consorcio') || descMin.includes('girasoles')) {
            tipoTransaccion = 'GASTO';
            categoria = 'Vivienda y Expensas';
            nivelRigidez = 'INFLEXIBLE';
          } else if (descMin.includes('seguro') || descMin.includes('equitativa') || descMin.includes('segunda segur') || descMin.includes('zurich') || descMin.includes('san cristobal')) {
            tipoTransaccion = 'GASTO';
            categoria = 'Seguros y Pólizas';
            nivelRigidez = 'INFLEXIBLE';
          } else if (descMin.includes('arca') || descMin.includes('afip') || descMin.includes('imp.afip') || descMin.includes('rentas') || descMin.includes('atp') || descMin.includes('agip')) {
            tipoTransaccion = 'GASTO';
            categoria = 'Impuestos y Tasas';
            nivelRigidez = 'INFLEXIBLE';
          } else if (descMin.includes('pedidosya') || descMin.includes('rappi') || descMin.includes('pizzeria') || descMin.includes('cinemark') || descMin.includes('mizuki') || descMin.includes('restauran') || descMin.includes('bar ') || descMin.includes('cafe')) {
            tipoTransaccion = 'GASTO';
            categoria = 'Salidas y Gastronomía';
            nivelRigidez = 'DISCRECIONAL';
          } else if (descMin.includes('coto') || descMin.includes('carrefour') || descMin.includes('jumbo') || descMin.includes('dia ') || descMin.includes('supermercado') || descMin.includes('disco') || descMin.includes('vea')) {
            tipoTransaccion = 'GASTO';
            categoria = 'Supermercado y Alimentos';
            nivelRigidez = 'OPERATIVO_ELASTICO';
          } else if (descMin.includes('ypf') || descMin.includes('shell') || descMin.includes('axion') || descMin.includes('combust') || descMin.includes('telepeaje') || descMin.includes('autopista') || descMin.includes('sube')) {
            tipoTransaccion = 'GASTO';
            categoria = 'Combustible y Movilidad';
            nivelRigidez = 'OPERATIVO_ELASTICO';
          } else if (descMin.includes('farmacia') || descMin.includes('farmacity') || descMin.includes('swiss medical') || descMin.includes('osde')) {
            tipoTransaccion = 'GASTO';
            categoria = 'Salud y Farmacia';
            nivelRigidez = 'INFLEXIBLE';
          } else {
            tipoTransaccion = 'GASTO';
            categoria = tipoExtracto === 'TARJETA_CREDITO' ? 'Consumo Tarjeta Crédito' : 'Consumo Bancario';
            nivelRigidez = 'OPERATIVO_ELASTICO';
          }
        }

        // Asignación de Miembro de Familia
        let idMiembroAsignado = miembros.find(m => m.rol === 'TITULAR_PRINCIPAL')?.id || 'titular';
        if (descMin.includes('chiara')) {
          const mChiara = miembros.find(m => m.nombre.toLowerCase().includes('chiara') || m.rol === 'DEPENDIENTE_ESTUDIANTE');
          if (mChiara) idMiembroAsignado = mChiara.id;
        } else if (descMin.includes('andrea')) {
          const mAndrea = miembros.find(m => m.nombre.toLowerCase().includes('andrea') || m.rol === 'CONYUGE');
          if (mAndrea) idMiembroAsignado = mAndrea.id;
        } else if (descMin.includes('juli') || descMin.includes('juliana')) {
          const mJuli = miembros.find(m => m.nombre.toLowerCase().includes('juli') || m.rol === 'DEPENDIENTE_SEMI');
          if (mJuli) idMiembroAsignado = mJuli.id;
        } else if (linea.ultimos_cuatro_digitos) {
          const miembroEncontrado = miembros.find(m => 
            m.digitos_tarjetas_asignadas.includes(linea.ultimos_cuatro_digitos!)
          );
          if (miembroEncontrado) {
            idMiembroAsignado = miembroEncontrado.id;
          }
        }

        // Asignación de Tarjeta de Crédito por los 4 dígitos del plástico
        let idTarjetaAsignada = idTarjetaOpcional;
        if (linea.ultimos_cuatro_digitos) {
          const tarjetaEncontrada = tarjetas.find(t => t.ultimos_cuatro_digitos === linea.ultimos_cuatro_digitos);
          if (tarjetaEncontrada) {
            idTarjetaAsignada = tarjetaEncontrada.id;
          }
        }

        const hash = generarHashConciliacion(linea.fecha, linea.monto, linea.comercio_crudo, linea.ultimos_cuatro_digitos);

        // Evitar duplicados si ya fue ingestada previamente
        const existente = await this.repoTransacciones.buscarPorHashConciliacion(hash);
        if (existente) {
          continue;
        }

        const nuevaTx: Transaccion = {
          id: crypto.randomUUID(),
          id_cuenta_origen: idCuentaOpcional,
          id_tarjeta_credito: idTarjetaAsignada,
          id_miembro_familia: idMiembroAsignado,
          fecha_transaccion: linea.fecha,
          fecha_compensacion: linea.fecha,
          monto: linea.monto,
          moneda: linea.moneda || 'ARS',
          tipo_transaccion: tipoTransaccion,
          nivel_rigidez: nivelRigidez,
          categoria: categoria,
          comercio: MotorMatchingHeuristico.normalizarComercio(linea.comercio_crudo),
          estado: 'CONFIRMADO',
          hash_conciliacion: hash
        };

        await this.repoTransacciones.guardar(nuevaTx);
        nuevasInsertadas.push(nuevaTx);
      }
    }

    return {
      lineasProcesadas: lineas.length,
      transaccionesConfirmadasFusionadas: confirmadasFusionadas,
      transaccionesNuevasInsertadas: nuevasInsertadas,
      totalDebitos: Number(totalDebitos.toFixed(2)),
      totalCreditos: Number(totalCreditos.toFixed(2)),
      totalMontoProcesado: Number(totalMonto.toFixed(2))
    };
  }
}
