/**
 * Esquema DDL para la Bóveda SQLite (BibliaFinanciera)
 * Conforme a Clean Architecture y modelado en castellano.
 */

export const ESQUEMA_DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cuentas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo_cuenta TEXT NOT NULL CHECK(tipo_cuenta IN ('CUENTA_CORRIENTE', 'CAJA_AHORRO', 'BILLETERA_VIRTUAL', 'CAJA_EFECTIVO')),
  moneda TEXT NOT NULL CHECK(moneda IN ('ARS', 'USD')),
  saldo_actual REAL NOT NULL DEFAULT 0,
  identificadores_cuenta TEXT NOT NULL DEFAULT '{}',
  es_reserva INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tarjetas_credito (
  id TEXT PRIMARY KEY,
  banco_emisor TEXT NOT NULL,
  marca_tarjeta TEXT NOT NULL CHECK(marca_tarjeta IN ('VISA', 'MASTERCARD', 'CABAL', 'AMEX', 'TUYA', 'MERCADO_PAGO')),
  ultimos_cuatro_digitos TEXT NOT NULL,
  dia_cierre_resumen INTEGER NOT NULL CHECK(dia_cierre_resumen BETWEEN 1 AND 31),
  dia_vencimiento_pago INTEGER NOT NULL CHECK(dia_vencimiento_pago BETWEEN 1 AND 31),
  id_cuenta_liquidacion TEXT NOT NULL REFERENCES cuentas(id),
  fecha_cierre_actual TEXT,
  fecha_vencimiento_actual TEXT,
  saldo_pesos_resumen REAL DEFAULT 0,
  saldo_dolares_resumen REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS compromisos_fijos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  monto REAL NOT NULL,
  moneda TEXT NOT NULL CHECK(moneda IN ('ARS', 'USD')),
  id_cuenta_debito TEXT NOT NULL REFERENCES cuentas(id),
  dia_vencimiento_estimado INTEGER NOT NULL CHECK(dia_vencimiento_estimado BETWEEN 1 AND 31),
  categoria TEXT NOT NULL,
  estado TEXT NOT NULL CHECK(estado IN ('PENDIENTE', 'PAGADO'))
);

CREATE INDEX IF NOT EXISTS idx_compromisos_cuenta ON compromisos_fijos(id_cuenta_debito, estado);

CREATE TABLE IF NOT EXISTS compromisos_mensuales (
  id TEXT PRIMARY KEY,
  id_cuenta_debito TEXT NOT NULL REFERENCES cuentas(id),
  mes_ciclo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL,
  monto REAL NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL CHECK(moneda IN ('ARS', 'USD')),
  dia_vencimiento_estimado INTEGER NOT NULL CHECK(dia_vencimiento_estimado BETWEEN 1 AND 31),
  fecha_vencimiento TEXT NOT NULL,
  estado TEXT NOT NULL CHECK(estado IN ('PENDIENTE', 'PAGADO')),
  fecha_pago TEXT,
  es_recurrente INTEGER NOT NULL DEFAULT 1,
  actualizado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_compromisos_mes ON compromisos_mensuales(mes_ciclo, id_cuenta_debito);
CREATE INDEX IF NOT EXISTS idx_compromisos_vencimiento ON compromisos_mensuales(mes_ciclo, fecha_vencimiento);


CREATE TABLE IF NOT EXISTS miembros_familia (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK(rol IN ('TITULAR_PRINCIPAL', 'CONYUGE', 'DEPENDIENTE_SEMI', 'DEPENDIENTE_ESTUDIANTE')),
  digitos_tarjetas_asignadas TEXT NOT NULL DEFAULT '[]',
  techo_presupuesto_mensual REAL,
  categorias_autorizadas TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS transacciones (
  id TEXT PRIMARY KEY,
  id_cuenta_origen TEXT REFERENCES cuentas(id),
  id_tarjeta_credito TEXT REFERENCES tarjetas_credito(id),
  id_miembro_familia TEXT NOT NULL REFERENCES miembros_familia(id),
  fecha_transaccion TEXT NOT NULL,
  fecha_compensacion TEXT,
  monto REAL NOT NULL,
  moneda TEXT NOT NULL CHECK(moneda IN ('ARS', 'USD')),
  tipo_cambio REAL,
  tipo_transaccion TEXT NOT NULL CHECK(tipo_transaccion IN ('GASTO', 'INGRESO_GENUINO', 'TRANSFERENCIA_INTERNA', 'RECUPERO_CAPITAL', 'RESCATE_DESAHORRO')),
  nivel_rigidez TEXT NOT NULL CHECK(nivel_rigidez IN ('INFLEXIBLE', 'OPERATIVO_ELASTICO', 'DISCRECIONAL')),
  categoria TEXT NOT NULL,
  comercio TEXT NOT NULL,
  estado TEXT NOT NULL CHECK(estado IN ('PROVISORIO', 'CONFIRMADO')),
  hash_conciliacion TEXT
);

CREATE INDEX IF NOT EXISTS idx_transacciones_hash ON transacciones(hash_conciliacion);
CREATE INDEX IF NOT EXISTS idx_transacciones_estado ON transacciones(estado);
CREATE INDEX IF NOT EXISTS idx_transacciones_fecha ON transacciones(fecha_transaccion);
CREATE INDEX IF NOT EXISTS idx_transacciones_miembro ON transacciones(id_miembro_familia);

CREATE TABLE IF NOT EXISTS planes_cuotas (
  id TEXT PRIMARY KEY,
  id_tarjeta_credito TEXT NOT NULL REFERENCES tarjetas_credito(id),
  id_miembro_familia TEXT NOT NULL REFERENCES miembros_familia(id),
  descripcion TEXT NOT NULL,
  monto_total REAL NOT NULL,
  total_cuotas INTEGER NOT NULL CHECK(total_cuotas > 0),
  fecha_inicio TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cronograma_cuotas (
  id TEXT PRIMARY KEY,
  id_plan_cuotas TEXT NOT NULL REFERENCES planes_cuotas(id) ON DELETE CASCADE,
  numero_cuota INTEGER NOT NULL CHECK(numero_cuota > 0),
  monto_cuota REAL NOT NULL,
  mes_ciclo_facturacion TEXT NOT NULL,
  estado TEXT NOT NULL CHECK(estado IN ('PENDIENTE', 'FACTURADO'))
);

CREATE INDEX IF NOT EXISTS idx_cuotas_mes ON cronograma_cuotas(mes_ciclo_facturacion, estado);
CREATE INDEX IF NOT EXISTS idx_cuotas_plan ON cronograma_cuotas(id_plan_cuotas);
`;
