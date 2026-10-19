/**
 * BovedaSqlite
 * Conector y gestor de ciclo de vida de la base de datos SQLite / SQLCipher.
 */

import { DatabaseSync } from 'node:sqlite';
import { ESQUEMA_DDL } from './esquemas.js';

export interface OpcionesBoveda {
  ruta?: string; // ':memory:' por defecto o ruta al archivo de base de datos
  claveCifrado?: string; // Llave para SQLCipher si se usa extensión cifrada
  modoLecturaExclusiva?: boolean;
}

export class BovedaSqlite {
  private db: DatabaseSync | null = null;
  private ruta: string;
  private claveCifrado?: string;

  constructor(opciones?: OpcionesBoveda) {
    this.ruta = opciones?.ruta ?? ':memory:';
    this.claveCifrado = opciones?.claveCifrado;
  }

  /**
   * Inicializa la conexión y aplica el esquema DDL si no existe.
   */
  public conectar(): void {
    if (this.db) return;

    this.db = new DatabaseSync(this.ruta);

    // Si se especifica clave de cifrado (estándar SQLCipher)
    if (this.claveCifrado) {
      this.db.exec(`PRAGMA key = '${this.claveCifrado.replace(/'/g, "''")}';`);
    }

    // Configuración de integridad y rendimiento
    this.db.exec('PRAGMA foreign_keys = ON;');
    if (this.ruta !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
    }

    // Inicializar DDL
    this.db.exec(ESQUEMA_DDL);
  }

  /**
   * Obtiene la instancia activa de DatabaseSync.
   */
  public obtenerBase(): DatabaseSync {
    if (!this.db) {
      this.conectar();
    }
    return this.db!;
  }

  /**
   * Ejecuta una serie de operaciones dentro de una transacción atómica.
   */
  public transaccion<T>(operacion: (db: DatabaseSync) => T): T {
    const db = this.obtenerBase();
    db.exec('BEGIN IMMEDIATE');
    try {
      const resultado = operacion(db);
      db.exec('COMMIT');
      return resultado;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Cierra la base de datos de manera limpia.
   */
  public cerrar(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
