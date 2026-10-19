/**
 * Punto de entrada principal (BibliaFinanciera)
 */

import { ServidorLocal } from './presentacion/servidor/ServidorLocal.js';

export * from './dominio/index.js';
export * from './aplicacion/index.js';
export * from './infraestructura/index.js';
export * from './presentacion/index.js';

const PUERTO = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Si se ejecuta directamente vía `node dist/index.js` o `npx tsx src/index.ts`
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  const servidor = new ServidorLocal();
  servidor.iniciar(PUERTO).then((puertoAsignado) => {
    console.log(`=======================================================`);
    console.log(`  BibliaFinanciera - Sistema de Gestión Personal T+0   `);
    console.log(`  Bóveda Activa: http://localhost:${puertoAsignado}   `);
    console.log(`=======================================================`);
  });
}
