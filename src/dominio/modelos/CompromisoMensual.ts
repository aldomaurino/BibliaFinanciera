/**
 * Entidad CompromisoMensual
 * Modela un compromiso o débito bancario para un ciclo mensual específico (ej. '2026-10').
 * Permite el control de fondeo, histórico mes a mes y fechas exactas de vencimiento.
 */

import { TipoMoneda } from './Cuenta.js';
import { EstadoCompromiso } from './CompromisoFijo.js';


export interface CompromisoMensual {
  id: string;
  id_cuenta_debito: string;         // FK a Cuentas (ej. 'cta-santander')
  mes_ciclo: string;                // Formato 'YYYY-MM' (ej. '2026-10')
  nombre: string;                   // ej. 'TC Visa', 'Expensas BsAs', 'Facultad'
  categoria: string;                // 'Tarjetas', 'Vivienda', 'Educación', 'Servicios', etc.
  monto: number;                    // Monto cargado del mes (0 si está pendiente de conocer)
  moneda: TipoMoneda;               // 'ARS' o 'USD'
  dia_vencimiento_estimado: number; // 1 - 31
  fecha_vencimiento: string;        // 'YYYY-MM-DD' para ordenamiento cronológico
  estado: EstadoCompromiso;         // 'PENDIENTE' | 'PAGADO'
  fecha_pago?: string;              // Fecha real en que se canceló
  es_recurrente: boolean;           // Si true, se clona automáticamente al iniciar un nuevo mes
  actualizado_en: string;           // ISO timestamp para control de sincronización PC <-> Celular
}
