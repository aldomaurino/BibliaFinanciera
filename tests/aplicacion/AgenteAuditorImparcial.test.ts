import { describe, it, expect, beforeEach } from 'vitest';
import { AgenteAuditorImparcial } from '../../src/aplicacion/agentes/AgenteAuditorImparcial.js';
import {
  RepositorioTransaccionesEnMemoria,
  RepositorioMiembrosEnMemoria
} from '../mocks/RepositoriosEnMemoria.js';
import { EstadoConsolidadoTesoreria } from '../../src/aplicacion/agentes/AgenteTesoreria.js';

describe('Agente 4: AgenteAuditorImparcial (Diagnóstico Cuantitativo)', () => {
  let repoTx: RepositorioTransaccionesEnMemoria;
  let repoMiembros: RepositorioMiembrosEnMemoria;
  let auditor: AgenteAuditorImparcial;

  beforeEach(async () => {
    repoTx = new RepositorioTransaccionesEnMemoria();
    repoMiembros = new RepositorioMiembrosEnMemoria();

    await repoMiembros.guardar({
      id: 'm-titular',
      nombre: 'Titular',
      rol: 'TITULAR_PRINCIPAL',
      digitos_tarjetas_asignadas: ['1111']
    });

    await repoMiembros.guardar({
      id: 'm-hija1',
      nombre: 'Hija 1',
      rol: 'DEPENDIENTE_SEMI',
      digitos_tarjetas_asignadas: ['2222'],
      categorias_autorizadas: ['Salud', 'Farmacia', 'Seguros']
    });

    auditor = new AgenteAuditorImparcial(repoTx, repoMiembros);
  });

  it('debe generar un dictamen cuantitativo detectando desvíos de categorías en dependientes', async () => {
    // Ingreso genuino
    await repoTx.guardar({
      id: 'tx-sueldo',
      id_miembro_familia: 'm-titular',
      fecha_transaccion: new Date(),
      monto: 1500000,
      moneda: 'ARS',
      tipo_transaccion: 'INGRESO_GENUINO',
      nivel_rigidez: 'INFLEXIBLE',
      categoria: 'Sueldo',
      comercio: 'Empleador',
      estado: 'CONFIRMADO'
    });

    // Gasto autorizado Hija 1 (Farmacia)
    await repoTx.guardar({
      id: 'tx-hija-1-ok',
      id_miembro_familia: 'm-hija1',
      fecha_transaccion: new Date(),
      monto: 25000,
      moneda: 'ARS',
      tipo_transaccion: 'GASTO',
      nivel_rigidez: 'INFLEXIBLE',
      categoria: 'Farmacia',
      comercio: 'Farmacity',
      estado: 'CONFIRMADO'
    });

    // Gasto NO autorizado Hija 1 (Ropa / Indumentaria)
    await repoTx.guardar({
      id: 'tx-hija-1-desvio',
      id_miembro_familia: 'm-hija1',
      fecha_transaccion: new Date(),
      monto: 60000,
      moneda: 'ARS',
      tipo_transaccion: 'GASTO',
      nivel_rigidez: 'DISCRECIONAL',
      categoria: 'Indumentaria',
      comercio: 'Zara Shopping',
      estado: 'CONFIRMADO'
    });

    const estadoMock: EstadoConsolidadoTesoreria = {
      safeToSpend: {
        safeToSpendDiario: 35000,
        saldoNetoProyectado: 500000,
        diasRestantes: 14,
        alertaDeficit: false
      },
      cascadaCuotas: {
        meses: [],
        deudaTotalComprometida12Meses: 0,
        mesMayorCompromiso: { mesCiclo: '2026-10', montoCuotasComprometidas: 0, ratioEndeudamiento: 0, superaUmbralCritico: false },
        ratioMaximo: 0,
        alertaRiesgoGlobal: false
      },
      totalLiquidezARS: 1200000,
      totalReservaUSD: 0,
      totalDesahorroMesActual: 0,
      deudaTarjetasCicloActual: 85000
    };

    const informe = await auditor.generarInforme(estadoMock, 15);

    expect(informe.balanceCaja.ingresosGenuinosNetos).toBe(1500000);
    expect(informe.balanceCaja.gastosTotalesDevengados).toBe(85000);
    expect(informe.balanceCaja.resultadoOperativo).toBe(1415000);
    expect(informe.balanceCaja.estado).toBe('SUPERAVIT');

    // Desvío en Hija 1
    const repHija1 = informe.distribucionFamilia.find(d => d.idMiembro === 'm-hija1');
    expect(repHija1?.totalGastado).toBe(85000);
    expect(repHija1?.desviosCategoriasNoAutorizadas).toHaveLength(1);
    expect(repHija1?.desviosCategoriasNoAutorizadas[0].categoria).toBe('Indumentaria');

    // Comprobar que el resumen textual es aséptico
    expect(informe.resumenTextoAseptico).toContain('INFORME DE AUDITORÍA CUANTITATIVA');
    expect(informe.resumenTextoAseptico).toContain('Directiva:');
  });
});
