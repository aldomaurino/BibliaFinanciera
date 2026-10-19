/**
 * ParserResumenTarjetaCSV
 * Procesa resúmenes de tarjetas de crédito: Visa, Mastercard, American Express, Tarjeta Tuya, Mercado Pago.
 */

import { IParserExtracto, InfoExtractoParseado } from './IParserExtracto.js';
import { LineaExtractoOficial } from '../../dominio/servicios/MotorMatchingHeuristico.js';

export class ParserResumenTarjetaCSV implements IParserExtracto {
  public puedeProcesar(contenido: string): boolean {
    const min = contenido.toLowerCase();
    return (
      min.includes('visa') ||
      min.includes('mastercard') ||
      min.includes('amex') ||
      min.includes('american express') ||
      min.includes('tuya') ||
      min.includes('tarjeta') ||
      min.includes('resumen') ||
      min.includes('cuota') ||
      min.includes('cierre')
    );
  }

  public parsear(contenido: string, ultimosDigitosPorDefecto?: string): InfoExtractoParseado {
    const lineas = contenido.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const emisor = this.inferirMarcaYEmisor(contenido);
    const digitosCabecera = this.extraerDigitosCabecera(contenido) || ultimosDigitosPorDefecto;

    const lineasOficiales: LineaExtractoOficial[] = [];

    // Separador común
    const separador = contenido.includes(';') ? ';' : ',';

    let indiceFecha = -1;
    let indiceDetalle = -1;
    let indiceMontoPesos = -1;
    let indiceMontoDolares = -1;
    let indiceCuota = -1;
    let indiceTarjeta = -1;
    let encabezadoEncontrado = false;

    for (const linea of lineas) {
      // Ignorar cabeceras informativas antes de la tabla
      const columnas = linea.split(separador).map(c => c.replace(/^["']|["']$/g, '').trim());

      if (!encabezadoEncontrado) {
        const filaMin = columnas.map(c => c.toLowerCase());
        const fIndex = filaMin.findIndex(c => c.includes('fecha'));
        if (fIndex !== -1) {
          indiceFecha = fIndex;
          indiceDetalle = filaMin.findIndex(c => c.includes('detalle') || c.includes('comercio') || c.includes('establecimiento') || c.includes('descrip'));
          indiceMontoPesos = filaMin.findIndex(c => c.includes('pesos') || c.includes('ars') || c === 'importe' || c === 'monto');
          indiceMontoDolares = filaMin.findIndex(c => c.includes('dolares') || c.includes('usd') || c.includes('u$s'));
          indiceCuota = filaMin.findIndex(c => c.includes('cuota'));
          indiceTarjeta = filaMin.findIndex(c => c.includes('tarjeta') || c.includes('plastico') || c.includes('cuenta'));
          encabezadoEncontrado = true;
          continue;
        }
      }

      if (encabezadoEncontrado && indiceFecha !== -1 && columnas.length > indiceFecha) {
        const rawFecha = columnas[indiceFecha];
        const fecha = this.parsearFecha(rawFecha);
        if (!fecha) continue;

        let comercio = indiceDetalle !== -1 && columnas[indiceDetalle] 
          ? columnas[indiceDetalle].trim() 
          : 'Consumo Tarjeta';

        // Si hay columna o mención de tarjeta/extensión
        let digitosLinea = digitosCabecera;
        if (indiceTarjeta !== -1 && columnas[indiceTarjeta]) {
          const matchDigitos = columnas[indiceTarjeta].match(/(\d{4})$/);
          if (matchDigitos) digitosLinea = matchDigitos[1];
        }

        // Si el detalle/comercio incluye un indicador explícito tipo *9911
        const matchEnTexto = comercio.match(/(?:\*{1,4}|terminad[ao]\s*en\s*)(\d{4})\b/i);
        if (matchEnTexto) {
          digitosLinea = matchEnTexto[1];
        }

        let monto = 0;
        if (indiceMontoPesos !== -1 && columnas[indiceMontoPesos]) {
          monto = this.parsearMonto(columnas[indiceMontoPesos]);
        }
        if (monto === 0 && indiceMontoDolares !== -1 && columnas[indiceMontoDolares]) {
          monto = this.parsearMonto(columnas[indiceMontoDolares]);
        }

        if (monto > 0) {
          lineasOficiales.push({
            fecha,
            monto,
            comercio_crudo: comercio,
            ultimos_cuatro_digitos: digitosLinea
          });
        }
      }
    }

    return {
      bancoOEmisor: emisor,
      tipo: 'TARJETA_CREDITO',
      ultimosCuatroDigitos: digitosCabecera,
      lineas: lineasOficiales
    };
  }

  private inferirMarcaYEmisor(texto: string): string {
    const min = texto.toLowerCase();
    if (min.includes('tuya')) return 'Tarjeta Tuya (Banco del Chaco)';
    if (min.includes('visa')) return 'Tarjeta Visa';
    if (min.includes('mastercard') || min.includes('master')) return 'Tarjeta Mastercard';
    if (min.includes('amex') || min.includes('american express')) return 'American Express';
    if (min.includes('mercado pago')) return 'Tarjeta Mercado Pago';
    return 'Tarjeta Crédito';
  }

  private extraerDigitosCabecera(texto: string): string | undefined {
    // Busca patrones tipo "Tarjeta: XXXX-XXXX-XXXX-4589" o "Terminada en 4589"
    const match = texto.match(/(?:terminada en|tarjeta[\s\w]*|cuenta[\s\w]*)[*xX\- ]{2,}(\d{4})/i);
    if (match) return match[1];

    const match4 = texto.match(/[*xX]{4}\s*(\d{4})/);
    if (match4) return match4[1];

    return undefined;
  }

  private parsearFecha(raw: string): Date | null {
    const limpio = raw.trim();
    const match = limpio.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (match) {
      const dia = parseInt(match[1], 10);
      const mes = parseInt(match[2], 10) - 1;
      let año = parseInt(match[3], 10);
      if (año < 100) año += 2000;
      return new Date(año, mes, dia);
    }
    const matchIso = limpio.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (matchIso) {
      const año = parseInt(matchIso[1], 10);
      const mes = parseInt(matchIso[2], 10) - 1;
      const dia = parseInt(matchIso[3], 10);
      return new Date(año, mes, dia);
    }
    return null;
  }

  private parsearMonto(raw: string): number {
    if (!raw) return 0;
    let limpio = raw.replace(/[^0-9,\.\-]/g, '').trim();
    if (!limpio) return 0;

    if (limpio.includes(',') && limpio.includes('.')) {
      if (limpio.lastIndexOf(',') > limpio.lastIndexOf('.')) {
        limpio = limpio.replace(/\./g, '').replace(',', '.');
      } else {
        limpio = limpio.replace(/,/g, '');
      }
    } else if (limpio.includes(',')) {
      limpio = limpio.replace(',', '.');
    }
    const num = Math.abs(parseFloat(limpio));
    return isNaN(num) ? 0 : num;
  }
}
