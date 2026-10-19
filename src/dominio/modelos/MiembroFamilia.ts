/**
 * Entidad MiembroFamilia
 * Representa los centros de costo y portadores familiares.
 */

export type RolMiembroFamilia = 
  | 'TITULAR_PRINCIPAL'
  | 'CONYUGE'
  | 'DEPENDIENTE_SEMI'
  | 'DEPENDIENTE_ESTUDIANTE';

export interface MiembroFamilia {
  id: string;
  nombre: string; // "Titular", "Cónyuge", "Hija 1", "Hija 2"
  rol: RolMiembroFamilia;
  digitos_tarjetas_asignadas: string[]; // ['1234', '5678']
  techo_presupuesto_mensual?: number;
  categorias_autorizadas?: string[]; // Ej. ['Salud', 'Farmacia', 'Seguros']
}

/**
 * Validador para determinar si una tarjeta o extensión pertenece al miembro familiar.
 */
export function miembroPoseeTarjeta(miembro: MiembroFamilia, ultimosDigitos: string): boolean {
  if (!ultimosDigitos) return false;
  const digitosLimpios = ultimosDigitos.replace(/\D/g, '');
  return miembro.digitos_tarjetas_asignadas.includes(digitosLimpios);
}

/**
 * Comprueba si una categoría está explícitamente autorizada para el miembro (para alertas preventivas).
 */
export function estaCategoriaAutorizada(miembro: MiembroFamilia, categoria: string): boolean {
  if (!miembro.categorias_autorizadas || miembro.categorias_autorizadas.length === 0) {
    return true; // Sin restricciones
  }
  const catNormalizada = categoria.trim().toLowerCase();
  return miembro.categorias_autorizadas.some(
    autorizada => autorizada.trim().toLowerCase() === catNormalizada
  );
}
