import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ServidorLocal } from '../../src/presentacion/servidor/ServidorLocal.js';
import { ControladorPrincipal } from '../../src/presentacion/controladores/ControladorPrincipal.js';
import { BovedaSqlite } from '../../src/infraestructura/persistencia/BovedaSqlite.js';

describe('ServidorLocal (Endpoints HTTP REST)', () => {
  let servidor: ServidorLocal;
  let puerto: number;
  let baseUrl: string;

  beforeAll(async () => {
    const boveda = new BovedaSqlite({ ruta: ':memory:' });
    const controlador = new ControladorPrincipal(boveda);
    servidor = new ServidorLocal(controlador);
    puerto = await servidor.iniciar(0); // Puerto dinámico libre
    baseUrl = `http://localhost:${puerto}`;
  });

  afterAll(async () => {
    await servidor.detener();
  });

  it('GET /api/tesoreria debe devolver las métricas de Safe-to-Spend', async () => {
    const res = await fetch(`${baseUrl}/api/tesoreria`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.safeToSpendDiario).toBeGreaterThanOrEqual(0);
    expect(data.saldoLiquidoTotal).toBeGreaterThan(0);
  });

  it('GET /api/tarjetas debe devolver plásticos y cascada de 12 meses', async () => {
    const res = await fetch(`${baseUrl}/api/tarjetas`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.tarjetas.length).toBeGreaterThan(0);
    expect(data.cascada12Meses).toHaveLength(12);
  });

  it('GET /api/familia debe devolver centros de costo y burn-rate', async () => {
    const res = await fetch(`${baseUrl}/api/familia`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.miembros.length).toBe(4);
  });

  it('GET /api/auditoria debe devolver informe imparcial', async () => {
    const res = await fetch(`${baseUrl}/api/auditoria`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.balanceCaja).toBeDefined();
    expect(data.directivaMatematica).toBeDefined();
  });

  it('POST /api/ingesta debe registrar un gasto T+0', async () => {
    const res = await fetch(`${baseUrl}/api/ingesta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: '12500 farmacia visa' })
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.exito).toBe(true);
    expect(data.transaccion.monto).toBe(12500);
    expect(data.transaccion.estado).toBe('PROVISORIO');
  });

  it('POST /api/simulador-what-if debe evaluar la viabilidad de una compra financiada', async () => {
    const res = await fetch(`${baseUrl}/api/simulador-what-if`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ montoTotal: 600000, cantidadCuotas: 6 })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.exito).toBe(true);
    expect(data.simulacion).toBeDefined();
    expect(typeof data.simulacion.esViable).toBe('boolean');
    expect(data.simulacion.mensajeDiagnostico).toBeDefined();
  });

  it('GET /api/fondeo-bancos debe devolver la previsión por banco', async () => {
    const res = await fetch(`${baseUrl}/api/fondeo-bancos`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    const santander = data.find((b: any) => b.idCuenta === 'cta-santander');
    expect(santander).toBeDefined();
  });

  it('POST /api/compromisos/:id/pagar debe cambiar el estado del compromiso', async () => {
    const res = await fetch(`${baseUrl}/api/compromisos/comp-arca/pagar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagado: true })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.exito).toBe(true);
  });

  it('POST /api/cuentas/:id/saldo debe actualizar el saldo de la cuenta', async () => {
    const res = await fetch(`${baseUrl}/api/cuentas/cta-santander/saldo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saldo: 50000 })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.exito).toBe(true);

    const cta = await servidor.controlador.repoCuentas.obtenerPorId('cta-santander');
    expect(cta?.saldo_actual).toBe(50000);
  });

  it('debe permitir crear y eliminar un nuevo compromiso fijo vía API', async () => {
    // Alta
    const resAlta = await fetch(`${baseUrl}/api/compromisos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'comp-alquiler-nuevo',
        nombre: 'Alquiler Temporario',
        monto: 350000,
        moneda: 'ARS',
        id_cuenta_debito: 'cta-santander',
        dia_vencimiento_estimado: 10,
        categoria: 'Vivienda'
      })
    });
    expect(resAlta.status).toBe(200);

    let comp = (await servidor.controlador.repoCompromisos.obtenerTodos()).find(c => c.id === 'comp-alquiler-nuevo');
    expect(comp).toBeDefined();
    expect(comp?.monto).toBe(350000);

    // Baja
    const resBaja = await fetch(`${baseUrl}/api/compromisos/comp-alquiler-nuevo`, {
      method: 'DELETE'
    });
    expect(resBaja.status).toBe(200);

    comp = (await servidor.controlador.repoCompromisos.obtenerTodos()).find(c => c.id === 'comp-alquiler-nuevo');
    expect(comp).toBeUndefined();
  });

  it('debe permitir dar de alta una nueva tarjeta y vincularla a un miembro', async () => {
    const res = await fetch(`${baseUrl}/api/tarjetas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'tc-tuya-nbch',
        banco_emisor: 'Banco del Chaco',
        marca_tarjeta: 'TUYA',
        ultimos_cuatro_digitos: '9988',
        dia_cierre_resumen: 22,
        dia_vencimiento_pago: 5,
        id_cuenta_liquidacion: 'cta-nbch',
        id_miembro_familiar: 'm-aldo'
      })
    });
    expect(res.status).toBe(200);

    const tc = await servidor.controlador.repoTarjetas.obtenerPorId('tc-tuya-nbch');
    expect(tc).toBeDefined();
    expect(tc?.marca_tarjeta).toBe('TUYA');

    const aldo = await servidor.controlador.repoMiembros.obtenerPorId('m-aldo');
    expect(aldo?.digitos_tarjetas_asignadas).toContain('9988');
  });

  it('debe permitir actualizar la configuración de tesorería vía API', async () => {
    const res = await fetch(`${baseUrl}/api/configuracion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservaContingenciaMinima: 150000,
        ingresoBaseEstimadoMensual: 4800000
      })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.config.reservaContingenciaMinima).toBe(150000);
    expect(data.config.ingresoBaseEstimadoMensual).toBe(4800000);
  });
});
