import { describe, it, expect } from 'vitest';
import { CalculadoraSafeToSpend } from '../../src/dominio/servicios/CalculadoraSafeToSpend.js';

describe('Servicio de Dominio: CalculadoraSafeToSpend', () => {
  it('debe calcular el Safe-to-Spend diario correctamente en un escenario normal de superávit', () => {
    // Escenario:
    // Saldo líquido = $1.500.000 (Santander + Chaco + Billeteras)
    // Fijos pendientes = $300.000 (Colegios, expensas)
    // Tarjetas ciclo actual = $400.000 (Provisorias T+0 + cuotas mes)
    // Reserva intocable = $200.000
    // Días restantes = 15
    // Saldo neto = 1.500.000 - 300.000 - 400.000 - 200.000 = $600.000
    // Safe-to-Spend diario = $600.000 / 15 = $40.000 por día
    const resultado = CalculadoraSafeToSpend.calcular({
      saldoLiquidoARS: 1500000,
      gastosInflexiblesPendientes: 300000,
      deudaTarjetasCicloActual: 400000,
      reservaContingenciaMinima: 200000,
      diasRestantesHastaIngreso: 15
    });

    expect(resultado.alertaDeficit).toBe(false);
    expect(resultado.saldoNetoProyectado).toBe(600000);
    expect(resultado.safeToSpendDiario).toBe(40000);
    expect(resultado.diasRestantes).toBe(15);
  });

  it('debe activar alerta de déficit y poner Safe-to-Spend en 0 si los pasivos superan la liquidez', () => {
    // Escenario déficit:
    // Saldo líquido = $500.000
    // Fijos = $300.000
    // Tarjetas = $400.000
    // Reserva = $100.000
    // Saldo neto = 500.000 - 800.000 = -$300.000
    const resultado = CalculadoraSafeToSpend.calcular({
      saldoLiquidoARS: 500000,
      gastosInflexiblesPendientes: 300000,
      deudaTarjetasCicloActual: 400000,
      reservaContingenciaMinima: 100000,
      diasRestantesHastaIngreso: 10
    });

    expect(resultado.alertaDeficit).toBe(true);
    expect(resultado.safeToSpendDiario).toBe(0);
    expect(resultado.saldoNetoProyectado).toBe(-300000);
    expect(resultado.motivoAlerta).toBeDefined();
  });

  it('debe reducir el Safe-to-Spend diario inmediatamente al cargar un gasto provisorio T+0 en tarjeta', () => {
    // Estado inicial:
    const inicial = CalculadoraSafeToSpend.calcular({
      saldoLiquidoARS: 1000000,
      gastosInflexiblesPendientes: 200000,
      deudaTarjetasCicloActual: 300000,
      reservaContingenciaMinima: 100000,
      diasRestantesHastaIngreso: 10
    });
    // Saldo neto = 400.000 / 10 = 40.000
    expect(inicial.safeToSpendDiario).toBe(40000);

    // Se realiza un gasto T+0 con tarjeta de crédito de $100.000
    const conGastoT0 = CalculadoraSafeToSpend.calcular({
      saldoLiquidoARS: 1000000,
      gastosInflexiblesPendientes: 200000,
      deudaTarjetasCicloActual: 300000 + 100000, // Provisión virtual inmediata
      reservaContingenciaMinima: 100000,
      diasRestantesHastaIngreso: 10
    });
    // Saldo neto = 300.000 / 10 = 30.000
    expect(conGastoT0.safeToSpendDiario).toBe(30000);
    expect(conGastoT0.safeToSpendDiario).toBeLessThan(inicial.safeToSpendDiario);
  });
});
