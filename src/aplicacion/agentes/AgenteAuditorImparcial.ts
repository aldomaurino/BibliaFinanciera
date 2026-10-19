/**
 * Agente 4: Agente Auditor Imparcial
 * Emite dictámenes cuantitativos estrictamente asépticos sin juicios morales.
 */

import { IRepositorioTransacciones } from '../../dominio/repositorios/IRepositorioTransacciones.js';
import { IRepositorioMiembros } from '../../dominio/repositorios/IRepositorioMiembros.js';
import { estaCategoriaAutorizada } from '../../dominio/modelos/MiembroFamilia.js';
import { EstadoConsolidadoTesoreria } from './AgenteTesoreria.js';

export interface ConsumoPortador {
  idMiembro: string;
  nombre: string;
  rol: string;
  totalGastado: number;
  porcentajeDelGastoTotal: number;
  desviosCategoriasNoAutorizadas: {
    categoria: string;
    monto: number;
    comercio: string;
  }[];
  velocidadConsumoDiaria: number; // Gasto / días transcurridos
}

export interface InformeAuditoriaImparcial {
  fechaGeneracion: Date;
  balanceCaja: {
    ingresosGenuinosNetos: number;
    gastosTotalesDevengados: number;
    resultadoOperativo: number; // Ingresos - Gastos
    estado: 'SUPERAVIT' | 'DEFICIT';
  };
  registroDesahorro: {
    montoTotalUSDConsumido: number;
    montoEquivalenteARS: number;
    alertaDeficitCubiertoConCapital: boolean;
  };
  distribucionFamilia: ConsumoPortador[];
  directivaMatematica: {
    safeToSpendDiarioAjustado: number;
    diasRestantesParaEquilibrio: number;
    accionRecomendada: string;
  };
  resumenTextoAseptico: string;
}

export class AgenteAuditorImparcial {
  constructor(
    private readonly repoTransacciones: IRepositorioTransacciones,
    private readonly repoMiembros: IRepositorioMiembros
  ) {}

  /**
   * Genera el informe aséptico y cuantitativo de auditoría.
   */
  public async generarInforme(
    estadoTesoreria: EstadoConsolidadoTesoreria,
    diasTranscurridosEnMes: number = new Date().getDate()
  ): Promise<InformeAuditoriaImparcial> {
    const transacciones = await this.repoTransacciones.obtenerTodas();
    const miembros = await this.repoMiembros.obtenerTodos();

    let ingresosGenuinos = 0;
    let gastosTotales = 0;
    let desahorroARS = 0;

    const mapaGastosPorMiembro = new Map<string, number>();
    const mapaDesviosPorMiembro = new Map<string, { categoria: string; monto: number; comercio: string }[]>();

    for (const m of miembros) {
      mapaGastosPorMiembro.set(m.id, 0);
      mapaDesviosPorMiembro.set(m.id, []);
    }

    for (const tx of transacciones) {
      if (tx.tipo_transaccion === 'INGRESO_GENUINO') {
        ingresosGenuinos += tx.monto;
      } else if (tx.tipo_transaccion === 'GASTO') {
        gastosTotales += tx.monto;
        
        // Asignación por miembro familiar
        const actual = mapaGastosPorMiembro.get(tx.id_miembro_familia) || 0;
        mapaGastosPorMiembro.set(tx.id_miembro_familia, actual + tx.monto);

        // Verificación de categorías autorizadas
        const miembro = miembros.find(m => m.id === tx.id_miembro_familia);
        if (miembro && !estaCategoriaAutorizada(miembro, tx.categoria)) {
          const desvios = mapaDesviosPorMiembro.get(miembro.id) || [];
          desvios.push({
            categoria: tx.categoria,
            monto: tx.monto,
            comercio: tx.comercio
          });
          mapaDesviosPorMiembro.set(miembro.id, desvios);
        }
      } else if (tx.tipo_transaccion === 'RESCATE_DESAHORRO') {
        desahorroARS += tx.monto;
      }
    }

    const resultadoOperativo = ingresosGenuinos - gastosTotales;
    const diasTranscurridos = Math.max(1, diasTranscurridosEnMes);

    // Desglose por miembro
    const distribucion: ConsumoPortador[] = miembros.map(m => {
      const gastado = Number((mapaGastosPorMiembro.get(m.id) || 0).toFixed(2));
      const pct = gastosTotales > 0 ? Number(((gastado / gastosTotales) * 100).toFixed(1)) : 0;
      const desvios = mapaDesviosPorMiembro.get(m.id) || [];
      const velocidad = Number((gastado / diasTranscurridos).toFixed(2));

      return {
        idMiembro: m.id,
        nombre: m.nombre,
        rol: m.rol,
        totalGastado: gastado,
        porcentajeDelGastoTotal: pct,
        desviosCategoriasNoAutorizadas: desvios,
        velocidadConsumoDiaria: velocidad
      };
    });

    const safeToSpendFinal = estadoTesoreria.safeToSpend.safeToSpendDiario;
    const diasRestantes = estadoTesoreria.safeToSpend.diasRestantes;

    let accion = `Mantener desembolso diario por debajo de $${safeToSpendFinal.toLocaleString('es-AR')} para llegar al cierre de ciclo con equilibrio de caja.`;
    if (resultadoOperativo < 0 || estadoTesoreria.safeToSpend.alertaDeficit) {
      accion = `ATENCIÓN: Déficit operativo detectado ($${Math.abs(resultadoOperativo).toLocaleString('es-AR')}). Limitar estrictamente consumos discrecionales a $0 y reajustar Safe-to-Spend a $${safeToSpendFinal.toLocaleString('es-AR')} diario.`;
    }

    const resumenAseptico = [
      `INFORME DE AUDITORÍA CUANTITATIVA - ${new Date().toISOString().split('T')[0]}`,
      `1. RESULTADO DE CAJA:`,
      `   - Ingresos Genuinos: $${ingresosGenuinos.toLocaleString('es-AR')}`,
      `   - Gastos Totales Devengados (T+0): $${gastosTotales.toLocaleString('es-AR')}`,
      `   - Balance Operativo: $${resultadoOperativo.toLocaleString('es-AR')} (${resultadoOperativo >= 0 ? 'SUPERÁVIT' : 'DÉFICIT'})`,
      `2. RESCATE DE CAPITAL (DESAHORRO):`,
      `   - Desahorro en el período: $${desahorroARS.toLocaleString('es-AR')}`,
      `3. DISTRIBUCIÓN POR PORTADOR:`,
      ...distribucion.map(d => `   - ${d.nombre} (${d.rol}): $${d.totalGastado.toLocaleString('es-AR')} (${d.porcentajeDelGastoTotal}%) | Ritmo: $${d.velocidadConsumoDiaria.toLocaleString('es-AR')}/día${d.desviosCategoriasNoAutorizadas.length > 0 ? ` [${d.desviosCategoriasNoAutorizadas.length} desvíos de categoría]` : ''}`),
      `4. DIRECTIVA MATEMÁTICA:`,
      `   - Safe-to-Spend diario límite: $${safeToSpendFinal.toLocaleString('es-AR')}`,
      `   - Días restantes para próximo ingreso: ${diasRestantes}`,
      `   - Directiva: ${accion}`
    ].join('\n');

    return {
      fechaGeneracion: new Date(),
      balanceCaja: {
        ingresosGenuinosNetos: Number(ingresosGenuinos.toFixed(2)),
        gastosTotalesDevengados: Number(gastosTotales.toFixed(2)),
        resultadoOperativo: Number(resultadoOperativo.toFixed(2)),
        estado: resultadoOperativo >= 0 ? 'SUPERAVIT' : 'DEFICIT'
      },
      registroDesahorro: {
        montoTotalUSDConsumido: 0,
        montoEquivalenteARS: Number(desahorroARS.toFixed(2)),
        alertaDeficitCubiertoConCapital: desahorroARS > 0
      },
      distribucionFamilia: distribucion,
      directivaMatematica: {
        safeToSpendDiarioAjustado: safeToSpendFinal,
        diasRestantesParaEquilibrio: diasRestantes,
        accionRecomendada: accion
      },
      resumenTextoAseptico: resumenAseptico
    };
  }
}
