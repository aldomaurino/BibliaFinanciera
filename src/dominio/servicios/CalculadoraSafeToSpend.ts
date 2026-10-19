/**
 * Servicio de Dominio: CalculadoraSafeToSpend
 * Ejecuta la ecuación dogmática de gasto seguro diario.
 */

export interface ParametrosSafeToSpend {
  saldoLiquidoARS: number;          // S_liquido: Cuentas y billeteras en pesos disponibles
  gastosInflexiblesPendientes: number; // G_inflexibles: Gastos fijos devengados del ciclo no pagados
  deudaTarjetasCicloActual: number;    // T_tarjetas: Consumos provisorios T+0 + cuotas del mes corriente
  reservaContingenciaMinima: number;   // R_contingencia: Colchón de seguridad intocable
  diasRestantesHastaIngreso: number;   // D_restantes: Días hasta el próximo cobro genuino
}

export interface ResultadoSafeToSpend {
  safeToSpendDiario: number;
  saldoNetoProyectado: number;
  diasRestantes: number;
  alertaDeficit: boolean;
  motivoAlerta?: string;
}

export class CalculadoraSafeToSpend {
  /**
   * Calcula el límite matemático diario disponible para gastar sin comprometer
   * el pago de tarjetas ni romper la reserva de contingencia.
   */
  public static calcular(params: ParametrosSafeToSpend): ResultadoSafeToSpend {
    const {
      saldoLiquidoARS,
      gastosInflexiblesPendientes,
      deudaTarjetasCicloActual,
      reservaContingenciaMinima,
      diasRestantesHastaIngreso
    } = params;

    const dias = Math.max(1, Math.round(diasRestantesHastaIngreso));
    
    // Saldo neto real antes de dividir por los días
    const saldoNeto = saldoLiquidoARS - gastosInflexiblesPendientes - deudaTarjetasCicloActual - reservaContingenciaMinima;

    if (saldoNeto <= 0) {
      return {
        safeToSpendDiario: 0,
        saldoNetoProyectado: Number(saldoNeto.toFixed(2)),
        diasRestantes: dias,
        alertaDeficit: true,
        motivoAlerta: 'Déficit de caja proyectado: Los compromisos fijos y tarjetas superan la liquidez disponible.'
      };
    }

    const diario = Number((saldoNeto / dias).toFixed(2));

    return {
      safeToSpendDiario: diario,
      saldoNetoProyectado: Number(saldoNeto.toFixed(2)),
      diasRestantes: dias,
      alertaDeficit: false
    };
  }
}
