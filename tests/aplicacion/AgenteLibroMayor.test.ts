import { describe, it, expect, beforeEach } from 'vitest';
import { AgenteLibroMayor } from '../../src/aplicacion/agentes/AgenteLibroMayor.js';
import {
  RepositorioCuentasEnMemoria,
  RepositorioTarjetasEnMemoria,
  RepositorioMiembrosEnMemoria,
  RepositorioTransaccionesEnMemoria
} from '../mocks/RepositoriosEnMemoria.js';
import { LineaExtractoOficial } from '../../src/dominio/servicios/MotorMatchingHeuristico.js';

describe('Agente 2: AgenteLibroMayor (Conciliación y Filtros Dogmáticos)', () => {
  let repoCuentas: RepositorioCuentasEnMemoria;
  let repoTarjetas: RepositorioTarjetasEnMemoria;
  let repoMiembros: RepositorioMiembrosEnMemoria;
  let repoTx: RepositorioTransaccionesEnMemoria;
  let agente: AgenteLibroMayor;

  beforeEach(async () => {
    repoCuentas = new RepositorioCuentasEnMemoria();
    repoTarjetas = new RepositorioTarjetasEnMemoria();
    repoMiembros = new RepositorioMiembrosEnMemoria();
    repoTx = new RepositorioTransaccionesEnMemoria();

    // Cuenta Santander
    await repoCuentas.guardar({
      id: 'cta-santander',
      nombre: 'Santander',
      tipo_cuenta: 'CUENTA_CORRIENTE',
      moneda: 'ARS',
      saldo_actual: 800000,
      identificadores_cuenta: {
        alias: ['ALDO.SANTANDER'],
        cbus: ['0720123488000012345678']
      }
    });

    // Cuenta Mercado Pago
    await repoCuentas.guardar({
      id: 'cta-mp',
      nombre: 'Mercado Pago',
      tipo_cuenta: 'BILLETERA_VIRTUAL',
      moneda: 'ARS',
      saldo_actual: 300000,
      identificadores_cuenta: {
        alias: ['ALDO.MP'],
        cvus: ['0000003100012345678901']
      }
    });

    // Tarjeta Visa
    await repoTarjetas.guardar({
      id: 'tc-visa',
      banco_emisor: 'Santander',
      marca_tarjeta: 'VISA',
      ultimos_cuatro_digitos: '4589',
      dia_cierre_resumen: 20,
      dia_vencimiento_pago: 5,
      id_cuenta_liquidacion: 'cta-santander'
    });

    // Miembros
    await repoMiembros.guardar({
      id: 'titular',
      nombre: 'Aldo',
      rol: 'TITULAR_PRINCIPAL',
      digitos_tarjetas_asignadas: ['4589']
    });

    agente = new AgenteLibroMayor(repoTx, repoCuentas, repoTarjetas, repoMiembros);
  });

  it('debe registrar como TRANSFERENCIA_INTERNA si el CBU/Alias destino es una cuenta propia', async () => {
    const tx = await agente.procesarTransferencia('cta-santander', 'ALDO.MP', 50000, 'titular');

    expect(tx.tipo_transaccion).toBe('TRANSFERENCIA_INTERNA');
    expect(tx.comercio).toContain('Traspaso a Mercado Pago');
  });

  it('debe registrar como GASTO si la transferencia es a un tercero desconocido', async () => {
    const tx = await agente.procesarTransferencia('cta-santander', 'JUAN.PEREZ.PROVEEDOR', 15000, 'titular');

    expect(tx.tipo_transaccion).toBe('GASTO');
    expect(tx.categoria).toBe('Transferencia a Tercero');
  });

  it('debe conciliar y fusionar un extracto oficial con una transacción provisoria T+0 preexistente', async () => {
    // 1. Se registra una compra provisoria T+0
    await repoTx.guardar({
      id: 'tx-prov-1',
      id_tarjeta_credito: 'tc-visa',
      id_miembro_familia: 'titular',
      fecha_transaccion: new Date('2026-09-10T10:00:00Z'),
      monto: 24000,
      moneda: 'ARS',
      tipo_transaccion: 'GASTO',
      nivel_rigidez: 'OPERATIVO_ELASTICO',
      categoria: 'Combustible',
      comercio: 'Shell San Martin',
      estado: 'PROVISORIO'
    });

    // 2. Llega el extracto bancario con esa misma compra compensada
    const lineasExtracto: LineaExtractoOficial[] = [
      {
        fecha: new Date('2026-09-12T00:00:00Z'),
        monto: 24000,
        comercio_crudo: 'SHELL SAN MARTIN RESISTENCIA',
        ultimos_cuatro_digitos: '4589'
      }
    ];

    const resultado = await agente.conciliarLoteExtracto(lineasExtracto, 'tc-visa');

    expect(resultado.transaccionesConfirmadasFusionadas).toHaveLength(1);
    expect(resultado.transaccionesNuevasInsertadas).toHaveLength(0);

    // Verificar en BD que el registro provisorio ahora está CONFIRMADO
    const txActualizada = await repoTx.obtenerPorId('tx-prov-1');
    expect(txActualizada?.estado).toBe('CONFIRMADO');
    expect(txActualizada?.categoria).toBe('Combustible'); // Retiene la categoría humana
  });
});
