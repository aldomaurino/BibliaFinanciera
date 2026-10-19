/**
 * Servicio de Dominio: MotorMatchingHeuristico
 * Algoritmo determinístico de conciliación entre registros provisorios (T+0)
 * y líneas procesadas de extractos bancarios o resúmenes de tarjetas.
 */

import { Transaccion } from '../modelos/Transaccion.js';

export interface LineaExtractoOficial {
  fecha: Date;
  monto: number;
  moneda?: 'ARS' | 'USD';
  comercio_crudo: string;
  ultimos_cuatro_digitos?: string;
  identificador_externo?: string;
  es_debito?: boolean; // true si es egreso/débito, false si es ingreso/crédito
  saldo_cuenta?: number; // Saldo posterior en cuenta si figura en la línea
  cuota_actual?: number; // Ej: 4 en "4 de 6"
  total_cuotas?: number; // Ej: 6 en "4 de 6"
}

export interface ResultadoMatching {
  transaccionProvisoriaOriginal?: Transaccion;
  puntajeCoincidencia: number;
  esCoincidenciaConfirmada: boolean; // Puntaje >= 0.85
  detallesPuntaje: {
    puntajeMonto: number;
    puntajeFecha: number;
    puntajeComercio: number;
    puntajeTarjeta: number;
  };
}

export class MotorMatchingHeuristico {
  public static readonly UMBRAL_CONFIRMACION = 0.85;

  private static readonly PESO_MONTO = 0.40;
  private static readonly PESO_FECHA = 0.20;
  private static readonly PESO_COMERCIO = 0.25;
  private static readonly PESO_TARJETA = 0.15;

  /**
   * Normaliza descripciones de comercios bancarios en Argentina (eliminando prefijos como MP*, PAYU*, etc.)
   */
  public static normalizarComercio(comercio: string): string {
    if (!comercio) return '';
    return comercio
      .toUpperCase()
      .replace(/\b(MP\*|MERCPAGO\*|PAYU\*|DEB\.DIR\*|DEBITO AUTOMATICO|DB |CR )\b/g, '')
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Distancia Levenshtein entre dos cadenas de texto.
   */
  public static calcularDistanciaLevenshtein(a: string, b: string): number {
    const s1 = a.toLowerCase();
    const s2 = b.toLowerCase();
    const m = s1.length;
    const n = s2.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const matriz: number[][] = [];

    for (let i = 0; i <= m; i++) {
      matriz[i] = [i];
    }
    for (let j = 0; j <= n; j++) {
      matriz[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const costo = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matriz[i][j] = Math.min(
          matriz[i - 1][j] + 1,       // Eliminación
          matriz[i][j - 1] + 1,       // Inserción
          matriz[i - 1][j - 1] + costo // Sustitución
        );
      }
    }

    return matriz[m][n];
  }

  /**
   * Similitud normalizada entre 0.0 y 1.0 basada en Levenshtein.
   */
  public static calcularSimilitudTexto(texto1: string, texto2: string): number {
    const t1 = this.normalizarComercio(texto1);
    const t2 = this.normalizarComercio(texto2);

    if (t1 === t2) return 1.0;
    if (t1.length === 0 || t2.length === 0) return 0.0;

    // Si uno contiene al otro, bonificación alta
    if (t1.includes(t2) || t2.includes(t1)) {
      return 0.90;
    }

    const maxLen = Math.max(t1.length, t2.length);
    const distancia = this.calcularDistanciaLevenshtein(t1, t2);
    return Math.max(0, 1.0 - distancia / maxLen);
  }

  /**
   * Evalúa la coincidencia entre una línea de extracto y una transacción provisoria.
   */
  public static evaluarCoincidencia(
    provisoria: Transaccion,
    lineaExtracto: LineaExtractoOficial,
    ultimosDigitosTarjetaRegistrada?: string
  ): ResultadoMatching {
    // 1. Igualdad de Monto (Tolerancia $0.05 por posibles redondeos de centavos)
    const difMonto = Math.abs(provisoria.monto - lineaExtracto.monto);
    let puntajeMonto = 0.0;
    if (difMonto === 0) {
      puntajeMonto = 1.0;
    } else if (difMonto <= 0.05) {
      puntajeMonto = 0.95;
    } else if (difMonto / Math.max(provisoria.monto, 1) < 0.01) {
      puntajeMonto = 0.80;
    }

    // 2. Ventana Temporal (Diferencia de días <= 4)
    const fechaP = new Date(provisoria.fecha_transaccion).getTime();
    const fechaE = new Date(lineaExtracto.fecha).getTime();
    const difDias = Math.abs(fechaP - fechaE) / (1000 * 60 * 60 * 24);
    
    let puntajeFecha = 0.0;
    if (difDias <= 1) {
      puntajeFecha = 1.0;
    } else if (difDias <= 4) {
      // Degrada linealmente entre 1 día y 4 días
      puntajeFecha = Math.max(0, 1.0 - (difDias - 1) * 0.25);
    }

    // 3. Similitud de Comercio
    const puntajeComercio = this.calcularSimilitudTexto(provisoria.comercio, lineaExtracto.comercio_crudo);

    // 4. Coincidencia de Dígitos de Tarjeta
    let puntajeTarjeta = 0.5; // Neutro si no se especifica en ninguna
    if (lineaExtracto.ultimos_cuatro_digitos && ultimosDigitosTarjetaRegistrada) {
      puntajeTarjeta = lineaExtracto.ultimos_cuatro_digitos === ultimosDigitosTarjetaRegistrada ? 1.0 : 0.0;
    }

    // Ponderación final
    const puntajeTotal = 
      (this.PESO_MONTO * puntajeMonto) +
      (this.PESO_FECHA * puntajeFecha) +
      (this.PESO_COMERCIO * puntajeComercio) +
      (this.PESO_TARJETA * puntajeTarjeta);

    return {
      transaccionProvisoriaOriginal: provisoria,
      puntajeCoincidencia: Number(puntajeTotal.toFixed(4)),
      esCoincidenciaConfirmada: puntajeTotal >= this.UMBRAL_CONFIRMACION,
      detallesPuntaje: {
        puntajeMonto,
        puntajeFecha,
        puntajeComercio,
        puntajeTarjeta
      }
    };
  }

  /**
   * Busca la mejor coincidencia para una línea de extracto dentro de un pool de transacciones provisorias.
   */
  public static buscarMejorCoincidencia(
    provisorias: Transaccion[],
    lineaExtracto: LineaExtractoOficial,
    mapaDigitosTarjetas: Map<string, string> // id_tarjeta -> ultimos 4 digitos
  ): ResultadoMatching | null {
    if (provisorias.length === 0) return null;

    let mejorResultado: ResultadoMatching | null = null;

    for (const provisoria of provisorias) {
      if (provisoria.estado !== 'PROVISORIO') continue;

      const digitos = provisoria.id_tarjeta_credito 
        ? mapaDigitosTarjetas.get(provisoria.id_tarjeta_credito)
        : undefined;

      const resultado = this.evaluarCoincidencia(provisoria, lineaExtracto, digitos);

      if (!mejorResultado || resultado.puntajeCoincidencia > mejorResultado.puntajeCoincidencia) {
        mejorResultado = resultado;
      }
    }

    return mejorResultado;
  }
}
