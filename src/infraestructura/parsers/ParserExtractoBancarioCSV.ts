/**
 * ParserExtractoBancarioCSV
 * Procesa extractos bancarios de Santander, Banco del Chaco y Billeteras Virtuales (Mercado Pago).
 */

import { IParserExtracto, InfoExtractoParseado } from './IParserExtracto.js';
import { LineaExtractoOficial } from '../../dominio/servicios/MotorMatchingHeuristico.js';

export class ParserExtractoBancarioCSV implements IParserExtracto {
  public puedeProcesar(contenido: string): boolean {
    const min = contenido.toLowerCase();
    return (
      min.includes('santander') ||
      min.includes('banco del chaco') ||
      min.includes('bchaco') ||
      min.includes('mercado pago') ||
      min.includes('saldo') ||
      (min.includes('fecha') && (min.includes('concepto') || min.includes('movimiento') || min.includes('importe')))
    );
  }

  public parsear(contenido: string): InfoExtractoParseado {
    const lineas = contenido.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lineas.length === 0) {
      return { bancoOEmisor: 'DESCONOCIDO', tipo: 'CUENTA_BANCARIA', lineas: [] };
    }

    const bancoInferido = this.inferirBanco(contenido);
    const lineasOficiales: LineaExtractoOficial[] = [];

    // Detectar separador (, o ;)
    const primeraConSeparador = lineas.find(l => l.includes(';') || l.includes(',')) || '';
    const separador = primeraConSeparador.includes(';') ? ';' : ',';

    let indiceFecha = -1;
    let indiceConcepto = -1;
    let indiceImporte = -1;
    let indiceDebito = -1;
    let indiceCredito = -1;

    let encabezadoEncontrado = false;

    for (const linea of lineas) {
      const columnas = this.dividirColumnas(linea, separador);

      if (!encabezadoEncontrado) {
        const filaMin = columnas.map(c => c.toLowerCase().trim());
        const fIndex = filaMin.findIndex(c => c.includes('fecha'));
        if (fIndex !== -1) {
          indiceFecha = fIndex;
          indiceConcepto = filaMin.findIndex(c => c.includes('concepto') || c.includes('detalle') || c.includes('movimiento') || c.includes('descrip'));
          indiceImporte = filaMin.findIndex(c => c === 'importe' || c === 'monto' || c.includes('monto neto'));
          indiceDebito = filaMin.findIndex(c => c.includes('débito') || c.includes('debito'));
          indiceCredito = filaMin.findIndex(c => c.includes('crédito') || c.includes('credito'));
          encabezadoEncontrado = true;
          continue;
        }
      }

      if (encabezadoEncontrado && indiceFecha !== -1 && columnas.length > indiceFecha) {
        const rawFecha = columnas[indiceFecha];
        const fecha = this.parsearFecha(rawFecha);
        if (!fecha) continue;

        const comercioCrudo = indiceConcepto !== -1 && columnas[indiceConcepto] 
          ? columnas[indiceConcepto].trim() 
          : 'Movimiento Bancario';

        let monto = 0;

        if (indiceImporte !== -1 && columnas[indiceImporte]) {
          monto = Math.abs(this.parsearMonto(columnas[indiceImporte]));
        } else if (indiceDebito !== -1 && columnas[indiceDebito]) {
          const deb = this.parsearMonto(columnas[indiceDebito]);
          if (deb > 0) monto = deb;
        }

        if (monto === 0 && indiceCredito !== -1 && columnas[indiceCredito]) {
          const cred = this.parsearMonto(columnas[indiceCredito]);
          if (cred > 0) monto = cred;
        }

        if (monto > 0) {
          lineasOficiales.push({
            fecha,
            monto,
            comercio_crudo: comercioCrudo
          });
        }
      }
    }

    return {
      bancoOEmisor: bancoInferido,
      tipo: 'CUENTA_BANCARIA',
      lineas: lineasOficiales
    };
  }

  private inferirBanco(contenido: string): string {
    const c = contenido.toLowerCase();
    if (c.includes('santander')) return 'Banco Santander';
    if (c.includes('banco del chaco') || c.includes('bchaco') || c.includes('tuya')) return 'Banco del Chaco';
    if (c.includes('mercado pago')) return 'Mercado Pago';
    return 'Banco Genérico';
  }

  private dividirColumnas(linea: string, separador: string): string[] {
    return linea.split(separador).map(c => c.replace(/^["']|["']$/g, '').trim());
  }

  public parsearFecha(raw: string): Date | null {
    const limpio = raw.trim();
    // DD/MM/YYYY o DD-MM-YYYY
    const match = limpio.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (match) {
      const dia = parseInt(match[1], 10);
      const mes = parseInt(match[2], 10) - 1;
      let año = parseInt(match[3], 10);
      if (año < 100) año += 2000;
      return new Date(año, mes, dia);
    }
    // YYYY-MM-DD
    const matchIso = limpio.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (matchIso) {
      const año = parseInt(matchIso[1], 10);
      const mes = parseInt(matchIso[2], 10) - 1;
      const dia = parseInt(matchIso[3], 10);
      return new Date(año, mes, dia);
    }
    return null;
  }

  public parsearMonto(raw: string): number {
    if (!raw) return 0;
    let limpio = raw.replace(/[^0-9,\.\-]/g, '').trim();
    if (!limpio) return 0;

    // Si tiene coma y punto, ej: 1.250,50 o 1,250.50
    if (limpio.includes(',') && limpio.includes('.')) {
      if (limpio.lastIndexOf(',') > limpio.lastIndexOf('.')) {
        // Formato europeo/argentino: 1.250,50
        limpio = limpio.replace(/\./g, '').replace(',', '.');
      } else {
        // Formato anglosajón: 1,250.50
        limpio = limpio.replace(/,/g, '');
      }
    } else if (limpio.includes(',')) {
      // Solo coma: ej 1250,50
      limpio = limpio.replace(',', '.');
    }
    const num = parseFloat(limpio);
    return isNaN(num) ? 0 : num;
  }
}
