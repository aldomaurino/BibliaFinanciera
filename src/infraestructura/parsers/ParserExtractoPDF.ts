/**
 * ParserExtractoPDF
 * Extrae texto y normaliza movimientos desde archivos PDF oficiales
 * (Santander, Banco del Chaco, Tarjeta Tuya, Visa, Mastercard, American Express).
 */

import { PDFParse } from 'pdf-parse';
import { IParserExtracto, InfoExtractoParseado, TipoOrigenExtracto, ResumenPlasticoIndividual, CuotaProyeccionResumen } from './IParserExtracto.js';
import { LineaExtractoOficial } from '../../dominio/servicios/MotorMatchingHeuristico.js';

const MESES_MAP: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
};

export class ParserExtractoPDF {
  /**
   * Extrae el texto completo de un Buffer PDF utilizando PDFParse.
   */
  public async extraerTexto(pdfBuffer: Buffer | Uint8Array): Promise<string> {
    const parser = new PDFParse({ data: pdfBuffer });
    try {
      const res = await parser.getText();
      return res.text || '';
    } finally {
      await parser.destroy();
    }
  }

  /**
   * Determina si el texto extraído del PDF corresponde a una tarjeta o a una cuenta bancaria.
   */
  public inferirTipo(texto: string): TipoOrigenExtracto {
    const min = texto.toLowerCase();

    // Palabras inequívocas de extracto de cuenta bancaria
    const indicioExtractoBancario =
      min.includes('cuenta única') ||
      min.includes('cuenta unica') ||
      min.includes('caja de ahorro') ||
      min.includes('cuenta corriente') ||
      min.includes('sucursal origen') ||
      min.includes('últimos movimientos') ||
      min.includes('ultimos movimientos') ||
      min.includes('extracto de cuenta') ||
      min.includes('extracto bancario');

    // Palabras exclusivas de resúmenes de tarjetas de crédito
    const indicioResumenTarjeta =
      min.includes('pago minimo') ||
      min.includes('pago mínimo') ||
      min.includes('limite de compra') ||
      min.includes('límite de compra') ||
      min.includes('saldo financiado') ||
      min.includes('cierre actual') ||
      min.includes('vencimiento actual') ||
      min.includes('resumen visa') ||
      min.includes('resumen american express') ||
      min.includes('resumen mastercard') ||
      min.includes('resumen de tarjeta');

    if (indicioExtractoBancario && !indicioResumenTarjeta) {
      return 'CUENTA_BANCARIA';
    }

    if (
      indicioResumenTarjeta ||
      (min.includes('tarjeta') && !indicioExtractoBancario) ||
      (min.includes('total a pagar') && (min.includes('visa') || min.includes('mastercard') || min.includes('amex') || min.includes('tuya')))
    ) {
      return 'TARJETA_CREDITO';
    }

    return indicioExtractoBancario ? 'CUENTA_BANCARIA' : 'TARJETA_CREDITO';
  }

  /**
   * Detecta la entidad bancaria o marca de tarjeta en el texto.
   */
  public inferirEntidad(texto: string): string {
    const min = texto.toLowerCase();
    if (min.includes('tuya')) return 'Tarjeta Tuya (Banco del Chaco)';
    if (min.includes('santander')) return 'Banco Santander';
    if (min.includes('banco del chaco') || min.includes('bchaco')) return 'Banco del Chaco';
    if (min.includes('visa')) return 'Tarjeta Visa';
    if (min.includes('mastercard') || min.includes('master')) return 'Tarjeta Mastercard';
    if (min.includes('amex') || min.includes('american express')) return 'American Express';
    if (min.includes('mercado pago')) return 'Mercado Pago';
    return 'Entidad Financiera';
  }

  /**
   * Detecta la marca de tarjeta en resúmenes de crédito.
   */
  public inferirMarcaTarjeta(texto: string): 'VISA' | 'AMEX' | 'MASTERCARD' | 'TUYA' | 'CABAL' | 'MERCADO_PAGO' | undefined {
    const min = texto.toLowerCase();
    if (min.includes('american express') || min.includes('amex')) return 'AMEX';
    if (min.includes('visa')) return 'VISA';
    if (min.includes('mastercard') || min.includes('master')) return 'MASTERCARD';
    if (min.includes('tuya')) return 'TUYA';
    if (min.includes('cabal')) return 'CABAL';
    if (min.includes('mercado pago')) return 'MERCADO_PAGO';
    return undefined;
  }

  /**
   * Extrae los últimos 4 dígitos del plástico si figuran en cabecera o detalle.
   */
  public extraerUltimosDigitos(texto: string, tipo?: TipoOrigenExtracto): string | undefined {
    // Si es cuenta bancaria, no inferir dígitos de tarjeta de la cabecera
    if (tipo === 'CUENTA_BANCARIA') return undefined;

    const match = texto.match(/(?:terminada en|tarjeta[\s\w]*|cuenta[\s\w]*)[*xX\- ]{2,}(\d{4})/i);
    if (match) return match[1];

    const match4 = texto.match(/[*xX]{4}\s*(\d{4})/);
    if (match4) return match4[1];

    return undefined;
  }

  /**
   * Parsea el texto del PDF y genera las LineaExtractoOficial tipadas.
   */
  public parsearTexto(texto: string, ultimosDigitosPorDefecto?: string): InfoExtractoParseado {
    const tipo = this.inferirTipo(texto);
    const emisor = this.inferirEntidad(texto);
    const marcaTarjeta = tipo === 'TARJETA_CREDITO' ? this.inferirMarcaTarjeta(texto) : undefined;

    if (tipo === 'TARJETA_CREDITO') {
      return this.parsearResumenTarjeta(texto, emisor, marcaTarjeta, ultimosDigitosPorDefecto);
    } else {
      return this.parsearExtractoBancario(texto, emisor, ultimosDigitosPorDefecto);
    }
  }

  /**
   * Parser especializado para Resúmenes de Tarjetas de Crédito (Santander Multi-plástico y Genéricos).
   */
  private parsearResumenTarjeta(
    texto: string,
    emisor: string,
    marcaTarjeta?: 'VISA' | 'AMEX' | 'MASTERCARD' | 'TUYA' | 'CABAL' | 'MERCADO_PAGO',
    ultimosDigitosPorDefecto?: string
  ): InfoExtractoParseado {
    // 1. Totales a pagar en pesos y dólares
    let saldoPesos: number | undefined = undefined;
    let saldoDolares: number | undefined = undefined;

    const mTotPesos = texto.match(/Total a pagar[\s\S]*?En pesos[\s\S]*?\$?\s*([\d\.,]+)/i) ||
                      texto.match(/Total a pagar\s*\$?\s*([\d\.,]+)/i) ||
                      texto.match(/(?:saldo actual|total a pagar|saldo en pesos)[\s\w:]*\$?\s*([\d\.,]+)/i);
    if (mTotPesos) {
      saldoPesos = this.normalizarMonto(mTotPesos[1]);
    }

    const mTotUSD = texto.match(/Total a pagar[\s\S]*?En d[oó]lares[\s\S]*?U\$S\s*([\d\.,]+)/i) ||
                    texto.match(/Total a pagar[\s\S]*?U\$S\s*([\d\.,]+)/i) ||
                    texto.match(/(?:saldo en d[oó]lares|total en usd|saldo u\$s)[\s\w:]*\$?\s*([\d\.,]+)/i);
    if (mTotUSD) {
      saldoDolares = this.normalizarMonto(mTotUSD[1]);
    }

    // 2. Fechas de Cierre y Vencimiento
    let fechaCierre: Date | undefined = undefined;
    let fechaVencimiento: Date | undefined = undefined;

    const mCierre = texto.match(/Cierre\s+actual\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i) ||
                    texto.match(/cierre(?:[\s\w]{0,15})?:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    if (mCierre) {
      fechaCierre = this.parsearFecha(mCierre[1]) || undefined;
    }

    const mVto = texto.match(/Vencimiento\s+actual\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i) ||
                 texto.match(/vencimiento(?:[\s\w]{0,15})?:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    if (mVto) {
      fechaVencimiento = this.parsearFecha(mVto[1]) || undefined;
    }

    // 3. Plásticos incluidos en el resumen (Especialidad Santander Multi-Adicional)
    const plasticos: ResumenPlasticoIndividual[] = [];
    const regexPlastico = /Terminada en\s+(\d{4})[\s\r\n]+de\s+([A-Za-z\s]+)[\s\r\n]+Total consumido[\s\r\n]+\$?\s*([\d\.,]+)[\s\r\n]+U\$S\s*([\d\.,]+)/gi;
    let mPlast;
    while ((mPlast = regexPlastico.exec(texto)) !== null) {
      plasticos.push({
        ultimosCuatroDigitos: mPlast[1].trim(),
        nombreTitular: mPlast[2].trim(),
        totalPesos: this.normalizarMonto(mPlast[3]),
        totalDolares: this.normalizarMonto(mPlast[4])
      });
    }

    // 4. Próximas cuotas a vencer (Oficial del resumen)
    const proyeccionCuotas: CuotaProyeccionResumen[] = [];
    const bloqueCuotas = texto.match(/Próximas cuotas a vencer[\s\S]*?(?:Copia fiel|--|$)/i);
    if (bloqueCuotas) {
      const lineasCuotas = bloqueCuotas[0].split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      for (let i = 0; i < lineasCuotas.length; i++) {
        const l = lineasCuotas[i];
        const mMes = l.match(/^(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)\s+(\d{4})$/i);
        if (mMes && i + 1 < lineasCuotas.length) {
          const nombreMes = mMes[1].toLowerCase();
          const anio = mMes[2];
          const numMes = String(MESES_MAP[nombreMes]).padStart(2, '0');
          const mesCiclo = `${anio}-${numMes}`;
          const montoCuota = this.normalizarMonto(lineasCuotas[i + 1]);
          if (montoCuota > 0) {
            proyeccionCuotas.push({ mesCiclo, monto: montoCuota });
          }
        }
      }
    }

    // 5. Procesamiento de Movimientos Línea por Línea
    const lineasCrudas = texto.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const lineasOficiales: LineaExtractoOficial[] = [];

    const digitosCabecera = plasticos.length > 0 
      ? plasticos[plasticos.length - 1].ultimosCuatroDigitos 
      : (this.extraerUltimosDigitos(texto, 'TARJETA_CREDITO') || ultimosDigitosPorDefecto);

    let titularPlastico = digitosCabecera;
    let plasticoActual = digitosCabecera;
    let seccionActual = plasticos.length > 0 ? 'HEADER' : 'MOVIMIENTOS';
    let ultimaFecha = fechaCierre || new Date();
    let bufferFecha: Date | undefined = undefined;
    let bufferDesc = '';

    for (let i = 0; i < lineasCrudas.length; i++) {
      const l = lineasCrudas[i];

      // Regla: Omitir la sección "Pago anterior y devoluciones" para no insertar el saldo/pago anterior como compras
      if (l.includes('Pago anterior y devoluciones')) {
        seccionActual = 'PAGO_ANTERIOR';
        bufferDesc = '';
        bufferFecha = undefined;
        continue;
      }

      // Detección de cambio de titular/plástico en sección de movimientos (requiere estar fuera de HEADER o ver 'Movimientos de')
      const mSeccPlast = l.match(/terminada en\s*(\d{4})/i);
      if (mSeccPlast && (l.toLowerCase().includes('movimientos') || (seccionActual !== 'HEADER' && (i > 70 || l.toLowerCase().includes('crédito'))))) {
        seccionActual = 'MOVIMIENTOS';
        plasticoActual = mSeccPlast[1];
        bufferDesc = '';
        bufferFecha = undefined;
        continue;
      }

      if (l.includes('Impuestos, intereses y percepciones')) {
        seccionActual = 'IMPUESTOS';
        bufferDesc = '';
        bufferFecha = undefined;
        continue;
      }

      if (l.startsWith('Términos y condiciones') || l.startsWith('Plan V:') || l.startsWith('Express Plan.')) {
        seccionActual = 'FOOTER';
        break;
      }

      // Ignorar pies de página, encabezados repetidos y subtotales informativos
      if (
        l.startsWith('Copia fiel') ||
        l.match(/^--\s*\d+\s+of\s+\d+\s*--$/) ||
        l.startsWith('Subtotal de') ||
        l.startsWith('Fecha Descripción') ||
        l.startsWith('Total a pagar') ||
        l.startsWith('Mínimo a pagar') ||
        l.startsWith('Total consumido') ||
        l.startsWith('*Si el monto') ||
        l.startsWith('Saldo del resumen')
      ) {
        continue;
      }

      if (seccionActual === 'PAGO_ANTERIOR' || seccionActual === 'HEADER' || seccionActual === 'FOOTER') {
        continue;
      }

      const lMin = l.toLowerCase();
      if (
        lMin.includes('cierre actual') ||
        lMin.includes('vencimiento actual') ||
        lMin.includes('limite de compra') ||
        lMin.includes('tarjeta:') ||
        lMin.includes('resumen de cuenta')
      ) {
        continue;
      }

      // Procesar línea de movimiento o impuesto
      const mFecha = l.match(/^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.+)$/);
      let textoL = l;

      if (mFecha) {
        const rawFecha = mFecha[1];
        const fParsed = this.parsearFecha(rawFecha);
        if (fParsed) {
          bufferFecha = fParsed;
          ultimaFecha = fParsed;
        }
        textoL = mFecha[2].trim();
      }

      const tieneSimbolo = textoL.includes('$') || textoL.includes('U$S');
      const mImporte = textoL.match(/(?:U\$S\s*([\d\.,]+)|(?:\$\s*([\d\.,]+))|(?:\$?\s*([\d\.,]+))\s*(?:pesos|dólares)?)$/i);

      // Descartar números largos sin decimales (códigos de barra, cupones largos de Telecom/Mercado Pago, referencias)
      const esCodigoLargo = /^\d{9,}$/.test(textoL.replace(/\s+/g, ''));
      if (esCodigoLargo || (!tieneSimbolo && !mFecha && seccionActual !== 'IMPUESTOS')) {
        if (!esCodigoLargo && textoL.length > 0) {
          bufferDesc += (bufferDesc ? ' ' : '') + textoL;
        }
        continue;
      }

      if (!mImporte) {
        if (textoL.length > 0) {
          bufferDesc += (bufferDesc ? ' ' : '') + textoL;
        }
        continue;
      }

      const esUSD = textoL.includes('U$S') || textoL.includes('dólares');
      const montoStr = mImporte[1] || mImporte[2] || mImporte[3];
      const monto = this.normalizarMonto(montoStr);
      // Seguridad: descartar importes irreales > 100.000.000 (evita que referencias numéricas se computen como dinero)
      if (monto <= 0 || monto > 100000000) continue;

      // Detectar información de cuotas (ej. "4 de 6", "2 de 3", "10 de 12")
      let cuotaActual: number | undefined = undefined;
      let totalCuotas: number | undefined = undefined;
      const textoCompleto = (bufferDesc + ' ' + textoL).trim();
      const mCuota = textoCompleto.match(/(\d{1,2})\s+de\s+(\d{1,2})/i);
      if (mCuota) {
        cuotaActual = parseInt(mCuota[1], 10);
        totalCuotas = parseInt(mCuota[2], 10);
      }

      // Limpiar descripción de comercio eliminando importes, cupones, códigos de barras y monedas
      let comercio = textoCompleto
        .replace(mImporte[0], '')
        .replace(/(\d{1,2})\s+de\s+(\d{1,2})/i, '')
        .replace(/\b\d{10,20}\b/g, '') // códigos de barra largos
        .replace(/\b\d{6,8}\b/g, '')  // comprobantes
        .replace(/\$/g, '')
        .replace(/U\$S/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (!comercio) {
        comercio = seccionActual === 'IMPUESTOS' ? 'Impuestos y Percepciones' : 'Consumo Tarjeta';
      }

      bufferDesc = '';
      const fechaFinal = bufferFecha || ultimaFecha;
      bufferFecha = undefined;

      // Asignar plástico de la sección o extensión *XXXX en línea
      let plasticoLinea = seccionActual === 'IMPUESTOS' ? (titularPlastico || plasticoActual) : plasticoActual;
      const matchExt = comercio.match(/(?:\*{1,4}|terminad[ao]\s*en\s*)(\d{4})\b/i);
      if (matchExt) {
        plasticoLinea = matchExt[1];
      }

      lineasOficiales.push({
        fecha: fechaFinal,
        monto,
        moneda: esUSD ? 'USD' : 'ARS',
        comercio_crudo: comercio,
        ultimos_cuatro_digitos: plasticoLinea,
        es_debito: true,
        cuota_actual: cuotaActual,
        total_cuotas: totalCuotas
      });
    }

    return {
      bancoOEmisor: emisor,
      marcaTarjeta,
      tipo: 'TARJETA_CREDITO',
      ultimosCuatroDigitos: digitosCabecera,
      fechaCierre,
      fechaVencimiento,
      saldoPesos,
      saldoDolares,
      plasticos,
      proyeccionCuotas,
      lineas: lineasOficiales
    };
  }

  /**
   * Parser especializado para extractos bancarios de cuenta corriente / caja de ahorro.
   */
  private parsearExtractoBancario(
    texto: string,
    emisor: string,
    ultimosDigitosPorDefecto?: string
  ): InfoExtractoParseado {
    const digitosCabecera = ultimosDigitosPorDefecto;
    const lineasCrudas = texto.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const lineasOficiales: LineaExtractoOficial[] = [];
    let saldoFinalCuenta: number | undefined = undefined;

    const regexFechaInicio = /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(.+)$/;

    for (const linea of lineasCrudas) {
      const matchFecha = linea.match(regexFechaInicio);
      if (!matchFecha) continue;

      const rawFecha = matchFecha[1];
      const restoLinea = matchFecha[2].trim();

      const fecha = this.parsearFecha(rawFecha);
      if (!fecha) continue;

      // Formato tabular bancario Santander / Online banking con sucursal y referencia
      const restoSinSucursal = restoLinea.replace(/^\d{3}\s*-\s*[A-ZÁÉÍÓÚ\s\-]+?\s+(?=(?:Transferencia|Compra|Credito|Transf|Debito|Seguro|Pago|Acreditacion|Liquidacion|Iva|Iibb|Percep|Comision|Devolucion)\b)/i, '');
      const matchSantander = restoSinSucursal.match(/^(.+?)\s+(\d{6,10})\s+([-+]?\d+(?:\.\d{2}))(?:\s+([-+]?\d+(?:\.\d{2})))?$/i);

      if (matchSantander) {
        const comercioCrudo = matchSantander[1].trim();
        const referencia = matchSantander[2];
        const montoRaw = parseFloat(matchSantander[3]);
        const saldoRaw = matchSantander[4] ? parseFloat(matchSantander[4]) : undefined;
        const esDebito = montoRaw < 0;
        const monto = Math.abs(montoRaw);

        if (saldoRaw !== undefined && saldoFinalCuenta === undefined) {
          saldoFinalCuenta = saldoRaw;
        }

        let digitosLinea = digitosCabecera;
        const matchTarjDeb = comercioCrudo.match(/tarj(?:\s+nro\.?|\s+numero)?\s*(\d{4})/i);
        if (matchTarjDeb) {
          digitosLinea = matchTarjDeb[1];
        }

        lineasOficiales.push({
          fecha,
          monto,
          moneda: 'ARS',
          comercio_crudo: comercioCrudo,
          ultimos_cuatro_digitos: digitosLinea,
          identificador_externo: referencia,
          es_debito: esDebito,
          saldo_cuenta: saldoRaw
        });
        continue;
      }

      // Formato genérico bancario
      const montosEncontrados = this.extraerMontosConSignoDeLinea(restoLinea);
      if (montosEncontrados.length === 0) continue;

      const primerMonto = montosEncontrados[0];
      const monto = Math.abs(primerMonto.valor);
      if (monto <= 0) continue;

      let comercio = restoLinea;
      for (const mStr of this.extraerStringsMonto(restoLinea)) {
        comercio = comercio.replace(mStr, ' ');
      }
      comercio = comercio.replace(/\s+/g, ' ').trim();

      let esDebito = true;
      const comMin = comercio.toLowerCase();
      if (primerMonto.valor < 0) {
        esDebito = true;
      } else if (
        primerMonto.valor > 0 &&
        (comMin.includes('haberes') ||
         comMin.includes('sueldo') ||
         comMin.includes('acreditacion') ||
         comMin.includes('credito') ||
         comMin.includes('reintegro') ||
         comMin.includes('devolucion') ||
         comMin.includes('interes'))
      ) {
        esDebito = false;
      } else {
        esDebito = true;
      }

      lineasOficiales.push({
        fecha,
        monto,
        moneda: 'ARS',
        comercio_crudo: comercio || 'Movimiento Bancario',
        ultimos_cuatro_digitos: digitosCabecera,
        es_debito: esDebito
      });
    }

    return {
      bancoOEmisor: emisor,
      tipo: 'CUENTA_BANCARIA',
      ultimosCuatroDigitos: digitosCabecera,
      saldoFinalCuenta,
      lineas: lineasOficiales
    };
  }

  /**
   * Procesa directamente un Buffer binario de un archivo PDF.
   */
  public async parsearBuffer(pdfBuffer: Buffer | Uint8Array, ultimosDigitosPorDefecto?: string): Promise<InfoExtractoParseado> {
    const texto = await this.extraerTexto(pdfBuffer);
    return this.parsearTexto(texto, ultimosDigitosPorDefecto);
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
    return null;
  }

  private extraerStringsMonto(linea: string): string[] {
    const matches = linea.match(/[-+]?\$?\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})|[-+]?\$?\s*\d+(?:,\d{2})|[-+]?\$?\s*\d+\.\d{2}/g);
    return matches || [];
  }

  private extraerMontosConSignoDeLinea(linea: string): Array<{ valor: number; raw: string }> {
    const strings = this.extraerStringsMonto(linea);
    const montos: Array<{ valor: number; raw: string }> = [];
    for (const str of strings) {
      const num = this.normalizarMontoConSigno(str);
      if (!isNaN(num) && num !== 0) {
        montos.push({ valor: num, raw: str });
      }
    }
    return montos;
  }

  private normalizarMonto(raw: string): number {
    return Math.abs(this.normalizarMontoConSigno(raw));
  }

  private normalizarMontoConSigno(raw: string): number {
    let limpio = raw.replace(/[^0-9,\.\-]/g, '').trim();
    if (!limpio) return 0;

    const esNegativo = limpio.startsWith('-');
    limpio = limpio.replace(/^-/, '');

    if (limpio.includes(',') && limpio.includes('.')) {
      if (limpio.lastIndexOf(',') > limpio.lastIndexOf('.')) {
        limpio = limpio.replace(/\./g, '').replace(',', '.');
      } else {
        limpio = limpio.replace(/,/g, '');
      }
    } else if (limpio.includes(',')) {
      limpio = limpio.replace(',', '.');
    }

    const num = parseFloat(limpio);
    if (isNaN(num)) return 0;
    return esNegativo ? -num : num;
  }
}
