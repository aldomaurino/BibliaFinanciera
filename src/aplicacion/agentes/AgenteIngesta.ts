/**
 * Agente 1: Agente de Ingesta (NLP y Multimodal)
 * Recibe texto libre o transcripción de voz al vuelo y emite un contrato tipado.
 */

import { z } from 'zod';

export const EsquemaTransaccionIngestada = z.object({
  entrada_cruda: z.string(),
  accion_detectada: z.enum([
    'GASTO_UNICO',
    'COMPRA_EN_CUOTAS',
    'TRANSFERENCIA_INTERNA',
    'OPERACION_DIVISAS',
    'RECUPERO_PRESTAMO',
    'EXTRACCION_CAJERO'
  ]),
  monto: z.number().positive(),
  moneda: z.enum(['ARS', 'USD']).default('ARS'),
  medio_pago: z.enum(['TARJETA_CREDITO', 'TARJETA_DEBITO', 'TRANSFERENCIA', 'EFECTIVO']),
  indicio_cuenta: z.string().optional(),
  indicio_miembro_familia: z.enum(['TITULAR', 'CONYUGE', 'HIJA_1', 'HIJA_2', 'NO_ESPECIFICADO']).default('NO_ESPECIFICADO'),
  cantidad_cuotas: z.number().int().min(1).default(1),
  comercio: z.string().default('Comercio No Especificado'),
  categoria_inferida: z.string().default('Varios'),
  rigidez_inferida: z.enum(['INFLEXIBLE', 'OPERATIVO_ELASTICO', 'DISCRECIONAL']).default('OPERATIVO_ELASTICO')
});

export type TransaccionIngestada = z.infer<typeof EsquemaTransaccionIngestada>;

export class AgenteIngesta {
  /**
   * Parser NLP determinístico local (Costo 0, 100% offline).
   * Analiza entradas típicas como:
   *  - "18500 nafta santander"
   *  - "35000 farmacia visa en 3 cuotas"
   *  - "extraccion cajero 40000"
   *  - "transferencia a mercadopago 50000"
   */
  public static parsearTexto(entrada: string): TransaccionIngestada {
    const texto = entrada.trim().toLowerCase();

    // 1. Detección de Extracción de Cajero
    if (texto.includes('cajero') || texto.includes('extraccion') || texto.includes('retiro efectivo')) {
      const monto = this.extraerMonto(texto);
      return EsquemaTransaccionIngestada.parse({
        entrada_cruda: entrada,
        accion_detectada: 'EXTRACCION_CAJERO',
        monto: monto || 0,
        moneda: 'ARS',
        medio_pago: 'EFECTIVO',
        comercio: 'Cajero Automático',
        categoria_inferida: 'EFECTIVO_AMORTIZADO',
        rigidez_inferida: 'OPERATIVO_ELASTICO'
      });
    }

    // 2. Detección de Transferencia Interna
    if (texto.includes('transferencia') || texto.includes('pase a ') || texto.includes('traspaso')) {
      const monto = this.extraerMonto(texto);
      return EsquemaTransaccionIngestada.parse({
        entrada_cruda: entrada,
        accion_detectada: 'TRANSFERENCIA_INTERNA',
        monto: monto || 0,
        moneda: 'ARS',
        medio_pago: 'TRANSFERENCIA',
        comercio: 'Transferencia Cuentas Propias',
        categoria_inferida: 'TRANSFERENCIA_INTERNA',
        rigidez_inferida: 'INFLEXIBLE'
      });
    }

    // 3. Detección de Cuotas
    const regexCuotas = /(\d+)\s*(cuotas|ctas|pagos)/i;
    const matchCuotas = texto.match(regexCuotas);
    const cantidadCuotas = matchCuotas ? parseInt(matchCuotas[1], 10) : 1;
    const accion = cantidadCuotas > 1 ? 'COMPRA_EN_CUOTAS' : 'GASTO_UNICO';

    // 4. Extracción de Monto
    const monto = this.extraerMonto(texto) || 0;

    // 5. Moneda
    const moneda = (texto.includes('usd') || texto.includes('dolar') || texto.includes('dolares')) ? 'USD' : 'ARS';

    // 6. Medio de pago
    let medioPago: 'TARJETA_CREDITO' | 'TARJETA_DEBITO' | 'TRANSFERENCIA' | 'EFECTIVO' = 'TARJETA_CREDITO';
    if (texto.includes('debito')) medioPago = 'TARJETA_DEBITO';
    else if (texto.includes('efectivo') || texto.includes('cash')) medioPago = 'EFECTIVO';
    else if (texto.includes('transferencia')) medioPago = 'TRANSFERENCIA';
    else if (texto.includes('credito') || texto.includes('visa') || texto.includes('master') || texto.includes('amex') || texto.includes('tuya')) {
      medioPago = 'TARJETA_CREDITO';
    }

    // 7. Comercio y Categoría inferida
    const comercio = this.inferirComercio(texto);
    const categoria = this.inferirCategoria(texto, comercio);
    const rigidez = this.inferirRigidez(categoria);

    // 8. Miembro de la familia inferido
    let miembro: 'TITULAR' | 'CONYUGE' | 'HIJA_1' | 'HIJA_2' | 'NO_ESPECIFICADO' = 'NO_ESPECIFICADO';
    if (texto.includes('chiara') || texto.includes('hija 2') || texto.includes('hija2')) miembro = 'HIJA_2';
    else if (texto.includes('juli') || texto.includes('juliana') || texto.includes('hija 1') || texto.includes('hija1')) miembro = 'HIJA_1';
    else if (texto.includes('andrea') || texto.includes('señora') || texto.includes('conyuge') || texto.includes('esposa')) miembro = 'CONYUGE';
    else if (texto.includes('aldo') || texto.includes('titular') || texto.includes('yo ') || texto.includes('mio')) miembro = 'TITULAR';

    return EsquemaTransaccionIngestada.parse({
      entrada_cruda: entrada,
      accion_detectada: accion,
      monto,
      moneda,
      medio_pago: medioPago,
      cantidad_cuotas: cantidadCuotas,
      comercio,
      categoria_inferida: categoria,
      rigidez_inferida: rigidez,
      indicio_miembro_familia: miembro
    });
  }

  private static extraerMonto(texto: string): number | null {
    // Busca números como 18500, 18.500, 18,500, $18500, etc.
    const regex = /(?:\$|\s|^)(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+)(?:\s|$|[a-z])/;
    const match = texto.match(regex);
    if (!match) return null;

    let raw = match[1];
    // Normalizar puntos y comas argentinas
    if (raw.includes('.') && raw.includes(',')) {
      raw = raw.replace(/\./g, '').replace(',', '.');
    } else if (raw.includes('.')) {
      // Puede ser separador de miles si tiene 3 dígitos después
      const partes = raw.split('.');
      if (partes.length > 1 && partes[partes.length - 1].length === 3) {
        raw = raw.replace(/\./g, '');
      }
    } else if (raw.includes(',')) {
      raw = raw.replace(',', '.');
    }

    const valor = parseFloat(raw);
    return isNaN(valor) ? null : valor;
  }

  private static inferirComercio(texto: string): string {
    if (texto.includes('ypf')) return 'YPF';
    if (texto.includes('shell')) return 'Shell';
    if (texto.includes('axion')) return 'Axion';
    if (texto.includes('nafta') || texto.includes('combustible')) return 'Estación de Combustible';
    if (texto.includes('farmacity')) return 'Farmacity';
    if (texto.includes('farmar')) return 'Farmar';
    if (texto.includes('farmacia') || texto.includes('remedios')) return 'Farmacia';
    if (texto.includes('carrefour')) return 'Carrefour';
    if (texto.includes('vea')) return 'Vea';
    if (texto.includes('coto')) return 'Coto';
    if (texto.includes('chango') || texto.includes('super')) return 'Supermercado';
    if (texto.includes('fravega')) return 'Frávega';
    if (texto.includes('garbarino')) return 'Garbarino';
    return 'Comercio General';
  }

  private static inferirCategoria(texto: string, comercio: string): string {
    if (texto.includes('nafta') || texto.includes('combustible') || comercio.includes('Combustible')) {
      return 'Combustible';
    }
    if (texto.includes('farmacia') || texto.includes('remedios') || texto.includes('medico') || texto.includes('salud')) {
      return 'Salud y Farmacia';
    }
    if (texto.includes('super') || comercio.includes('Supermercado')) {
      return 'Supermercado y Alimentos';
    }
    if (texto.includes('colegio') || texto.includes('cuota colegio')) {
      return 'Educación';
    }
    if (texto.includes('luz') || texto.includes('gas') || texto.includes('internet') || texto.includes('expensas')) {
      return 'Servicios y Hogar';
    }
    return 'Consumo Corriente';
  }

  private static inferirRigidez(categoria: string): 'INFLEXIBLE' | 'OPERATIVO_ELASTICO' | 'DISCRECIONAL' {
    if (categoria === 'Educación' || categoria === 'Servicios y Hogar' || categoria === 'Salud y Farmacia') {
      return 'INFLEXIBLE';
    }
    if (categoria === 'Combustible' || categoria === 'Supermercado y Alimentos') {
      return 'OPERATIVO_ELASTICO';
    }
    return 'DISCRECIONAL';
  }
}
