import { describe, it, expect } from 'vitest';
import { ProyectorCascadaCuotas } from '../../src/dominio/servicios/ProyectorCascadaCuotas.js';
import { CronogramaCuota } from '../../src/dominio/modelos/PlanCuotas.js';

describe('Servicio de Dominio: ProyectorCascadaCuotas', () => {
  const fechaRef = new Date(2026, 8, 1); // Septiembre 2026

  it('debe generar exactamente los próximos 12 meses en formato YYYY-MM', () => {
    const meses = ProyectorCascadaCuotas.obtenerProximos12Meses(fechaRef);
    expect(meses).toHaveLength(12);
    expect(meses[0]).toBe('2026-10'); // Octubre
    expect(meses[11]).toBe('2027-09'); // Septiembre año siguiente
  });

  it('debe proyectar correctamente la deuda acumulada de cuotas y calcular ratios', () => {
    const ingresoBase = 1000000; // $1.000.000
    const cuotas: CronogramaCuota[] = [
      { id: '1', id_plan_cuotas: 'p1', numero_cuota: 1, monto_cuota: 150000, mes_ciclo_facturacion: '2026-10', estado: 'PENDIENTE' },
      { id: '2', id_plan_cuotas: 'p1', numero_cuota: 2, monto_cuota: 150000, mes_ciclo_facturacion: '2026-11', estado: 'PENDIENTE' },
      { id: '3', id_plan_cuotas: 'p2', numero_cuota: 1, monto_cuota: 100000, mes_ciclo_facturacion: '2026-10', estado: 'PENDIENTE' },
    ];

    const proyeccion = ProyectorCascadaCuotas.proyectar(cuotas, ingresoBase, fechaRef);

    // En 2026-10: 150.000 + 100.000 = 250.000 (Ratio = 0.25 -> 25%)
    const mesOctubre = proyeccion.meses.find(m => m.mesCiclo === '2026-10');
    expect(mesOctubre?.montoCuotasComprometidas).toBe(250000);
    expect(mesOctubre?.ratioEndeudamiento).toBe(0.25);
    expect(mesOctubre?.superaUmbralCritico).toBe(false);

    // En 2026-11: 150.000 (Ratio = 0.15)
    const mesNoviembre = proyeccion.meses.find(m => m.mesCiclo === '2026-11');
    expect(mesNoviembre?.montoCuotasComprometidas).toBe(150000);

    expect(proyeccion.deudaTotalComprometida12Meses).toBe(400000);
    expect(proyeccion.alertaRiesgoGlobal).toBe(false);
  });

  it('debe activar bloqueo preventivo en el Simulador What-If si una compra supera el 35% del ingreso', () => {
    const ingresoBase = 1000000;
    // Ya tenemos comprometidos $250.000 en 2026-10 (25%)
    const cuotas: CronogramaCuota[] = [
      { id: '1', id_plan_cuotas: 'p1', numero_cuota: 1, monto_cuota: 250000, mes_ciclo_facturacion: '2026-10', estado: 'PENDIENTE' },
    ];

    // Queremos comprar un electrodoméstico de $360.000 en 3 cuotas ($120.000/mes)
    // 250.000 + 120.000 = 370.000 en 2026-10 -> Ratio = 0.37 (37% > 35% UMBRAL CRÍTICO)
    const simulacion = ProyectorCascadaCuotas.simularNuevaCompra(
      cuotas,
      ingresoBase,
      360000,
      3,
      fechaRef
    );

    expect(simulacion.esViable).toBe(false);
    expect(simulacion.mesesAfectadosConAlerta).toContain('2026-10');
    expect(simulacion.mensajeDiagnostico).toMatch(/Bloqueo preventivo/);
  });

  it('debe autorizar en el Simulador What-If si la compra se mantiene dentro del margen seguro', () => {
    const ingresoBase = 1000000;
    const cuotas: CronogramaCuota[] = [
      { id: '1', id_plan_cuotas: 'p1', numero_cuota: 1, monto_cuota: 100000, mes_ciclo_facturacion: '2026-10', estado: 'PENDIENTE' },
    ];

    // Compra de $180.000 en 3 cuotas ($60.000/mes)
    // Total mes = 100.000 + 60.000 = 160.000 -> 16% (Menor a 35%)
    const simulacion = ProyectorCascadaCuotas.simularNuevaCompra(
      cuotas,
      ingresoBase,
      180000,
      3,
      fechaRef
    );

    expect(simulacion.esViable).toBe(true);
    expect(simulacion.mesesAfectadosConAlerta).toHaveLength(0);
    expect(simulacion.mensajeDiagnostico).toMatch(/Compra viable/);
  });
});
