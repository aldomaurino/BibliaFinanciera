import { describe, it, expect } from 'vitest';
import { ParserExtractoBancarioCSV } from '../../src/infraestructura/parsers/ParserExtractoBancarioCSV.js';
import { ParserResumenTarjetaCSV } from '../../src/infraestructura/parsers/ParserResumenTarjetaCSV.js';
import { BovedaSqlite } from '../../src/infraestructura/persistencia/BovedaSqlite.js';
import { RepositorioTransaccionesSqlite } from '../../src/infraestructura/persistencia/RepositorioTransaccionesSqlite.js';
import { RepositorioCuentasSqlite } from '../../src/infraestructura/persistencia/RepositorioCuentasSqlite.js';
import { RepositorioTarjetasSqlite } from '../../src/infraestructura/persistencia/RepositorioTarjetasSqlite.js';
import { RepositorioMiembrosSqlite } from '../../src/infraestructura/persistencia/RepositorioMiembrosSqlite.js';
import { AgenteLibroMayor } from '../../src/aplicacion/agentes/AgenteLibroMayor.js';
import { Transaccion } from '../../src/dominio/modelos/Transaccion.js';
import { MiembroFamilia } from '../../src/dominio/modelos/MiembroFamilia.js';
import { TarjetaCredito } from '../../src/dominio/modelos/TarjetaCredito.js';

describe('Parsers de Extractos e Integración con AgenteLibroMayor', () => {
  it('debe parsear un extracto bancario CSV de Santander / Banco del Chaco', () => {
    const csvBanco = `
Banco Santander - Movimientos de Cuenta Corriente
Fecha;Concepto;Comprobante;Débito;Crédito;Saldo
10/05/2026;YPF RESISTENCIA;102938;18.500,00;;481.500,00
11/05/2026;SUPERMERCADO DIA;102939;42.300,50;;439.199,50
12/05/2026;TRANSFERENCIA RECIBIDA;102940;;150.000,00;589.199,50
`;

    const parser = new ParserExtractoBancarioCSV();
    expect(parser.puedeProcesar(csvBanco)).toBe(true);

    const resultado = parser.parsear(csvBanco);
    expect(resultado.tipo).toBe('CUENTA_BANCARIA');
    expect(resultado.bancoOEmisor).toBe('Banco Santander');
    expect(resultado.lineas).toHaveLength(3);

    expect(resultado.lineas[0].comercio_crudo).toBe('YPF RESISTENCIA');
    expect(resultado.lineas[0].monto).toBe(18500);
    expect(resultado.lineas[0].fecha.getDate()).toBe(10);
    expect(resultado.lineas[0].fecha.getMonth()).toBe(4); // Mayo (0-indexed)

    expect(resultado.lineas[1].comercio_crudo).toBe('SUPERMERCADO DIA');
    expect(resultado.lineas[1].monto).toBe(42300.50);

    expect(resultado.lineas[2].monto).toBe(150000);
  });

  it('debe parsear un resumen de tarjeta de crédito con extensiones y cuotas', () => {
    const csvTarjeta = `
Resumen Mensual Tarjeta Tuya - Titular: Aldo
Cuenta: **** **** **** 4589
Fecha,Detalle,Cuota,Importe ARS,Importe USD
15/05/2026,FARMACIA DEL PUEBLO C.01/03,1/3,15400.00,0.00
16/05/2026,GARBARINO RESISTENCIA *9911,1/6,85000.00,0.00
`;

    const parser = new ParserResumenTarjetaCSV();
    expect(parser.puedeProcesar(csvTarjeta)).toBe(true);

    const resultado = parser.parsear(csvTarjeta);
    expect(resultado.tipo).toBe('TARJETA_CREDITO');
    expect(resultado.bancoOEmisor).toContain('Tarjeta Tuya');
    expect(resultado.ultimosCuatroDigitos).toBe('4589');
    expect(resultado.lineas).toHaveLength(2);

    // Primera línea hereda la cabecera 4589
    expect(resultado.lineas[0].monto).toBe(15400);
    expect(resultado.lineas[0].ultimos_cuatro_digitos).toBe('4589');

    // Segunda línea detecta extensión 9911 en el comercio
    expect(resultado.lineas[1].monto).toBe(85000);
    expect(resultado.lineas[1].ultimos_cuatro_digitos).toBe('9911');
  });

  it('End-to-End: debe conciliar extracto procesado por parser contra base SQLite real', async () => {
    const boveda = new BovedaSqlite({ ruta: ':memory:' });
    boveda.conectar();

    const repoCuentas = new RepositorioCuentasSqlite(boveda);
    const repoTarjetas = new RepositorioTarjetasSqlite(boveda);
    const repoMiembros = new RepositorioMiembrosSqlite(boveda);
    const repoTransacciones = new RepositorioTransaccionesSqlite(boveda);

    // 1. Configuramos el Titular e Hija 1
    const titular: MiembroFamilia = {
      id: 'm-titular',
      nombre: 'Titular',
      rol: 'TITULAR_PRINCIPAL',
      digitos_tarjetas_asignadas: ['4589']
    };
    await repoMiembros.guardar(titular);

    // 2. Cargamos una cuenta y una tarjeta
    await repoCuentas.guardar({
      id: 'cta-santander',
      nombre: 'Santander Principal',
      tipo_cuenta: 'CUENTA_CORRIENTE',
      moneda: 'ARS',
      saldo_actual: 500000,
      identificadores_cuenta: {}
    });

    const tarjeta: TarjetaCredito = {
      id: 'tc-visa',
      banco_emisor: 'Santander',
      marca_tarjeta: 'VISA',
      ultimos_cuatro_digitos: '4589',
      dia_cierre_resumen: 20,
      dia_vencimiento_pago: 28,
      id_cuenta_liquidacion: 'cta-santander'
    };
    await repoTarjetas.guardar(tarjeta);

    // 3. Cargamos una transacción PROVISORIA (T+0 al vuelo) cargada por el Titular
    const txProvisoria: Transaccion = {
      id: 'tx-prov-1',
      id_miembro_familia: 'm-titular',
      id_tarjeta_credito: 'tc-visa',
      fecha_transaccion: new Date('2026-05-15T10:00:00Z'),
      monto: 18500,
      moneda: 'ARS',
      tipo_transaccion: 'GASTO',
      nivel_rigidez: 'OPERATIVO_ELASTICO',
      categoria: 'Combustible',
      comercio: 'YPF',
      estado: 'PROVISORIO'
    };
    await repoTransacciones.guardar(txProvisoria);

    // 4. Se recibe el resumen oficial de tarjeta con el cobro ya compensado
    const csvResumen = `
Resumen Santander Visa
Tarjeta terminada en 4589
Fecha;Detalle;Importe Pesos
16/05/2026;ESTACION YPF RESISTENCIA;18.500,00
17/05/2026;FARMACITY CHACO;7.200,00
`;
    const parser = new ParserResumenTarjetaCSV();
    const parseado = parser.parsear(csvResumen);

    // 5. AgenteLibroMayor procesa el extracto
    const agenteLibroMayor = new AgenteLibroMayor(
      repoTransacciones,
      repoCuentas,
      repoTarjetas,
      repoMiembros
    );

    const resultado = await agenteLibroMayor.conciliarLoteExtracto(parseado.lineas, 'tc-visa');

    expect(resultado.lineasProcesadas).toBe(2);
    // Debe haber conciliado la de YPF (monto exacto 18500, comercio similar YPF, fecha +1 día)
    expect(resultado.transaccionesConfirmadasFusionadas).toHaveLength(1);
    expect(resultado.transaccionesConfirmadasFusionadas[0].id).toBe('tx-prov-1');
    expect(resultado.transaccionesConfirmadasFusionadas[0].estado).toBe('CONFIRMADO');
    expect(resultado.transaccionesConfirmadasFusionadas[0].categoria).toBe('Combustible'); // Retiene categoría T+0

    // Y debe haber insertado una nueva para Farmacity que no estaba en T+0
    expect(resultado.transaccionesNuevasInsertadas).toHaveLength(1);
    expect(resultado.transaccionesNuevasInsertadas[0].comercio).toContain('FARMACITY');

    // 6. Verificamos en la base de datos SQLite
    const provisoriasRestantes = await repoTransacciones.obtenerProvisorias();
    expect(provisoriasRestantes).toHaveLength(0); // Ya no quedan provisorias

    const todas = await repoTransacciones.obtenerTodas();
    expect(todas).toHaveLength(2);

    boveda.cerrar();
  });
});
