/**
 * ServidorLocal (Capa de Presentación)
 * Servidor HTTP nativo en Node.js (cero dependencias externas).
 * Expone la API REST para las 4 vistas maestras y sirve la aplicación web mobile-first.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { ControladorPrincipal } from '../controladores/ControladorPrincipal.js';
import { sembrarDatosIniciales } from '../datos/SembradorDatosIniciales.js';
import { BovedaSqlite } from '../../infraestructura/persistencia/BovedaSqlite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ServidorLocal {
  private server: http.Server | null = null;
  public readonly controlador: ControladorPrincipal;
  private readonly rutaPublic: string;

  constructor(controlador?: ControladorPrincipal, rutaPublic?: string) {
    if (controlador) {
      this.controlador = controlador;
    } else {
      // Base de datos persistente en disco biblia_financiera.db
      const boveda = new BovedaSqlite({
        ruta: path.resolve(process.cwd(), 'biblia_financiera.db')
      });
      this.controlador = new ControladorPrincipal(boveda);
    }

    this.rutaPublic = rutaPublic ?? path.resolve(process.cwd(), 'public');
  }

  public obtenerIpLocal(): string {
    const interfaces = os.networkInterfaces();
    for (const nombre of Object.keys(interfaces)) {
      for (const iface of interfaces[nombre] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  public async iniciar(puerto: number = 3000): Promise<number> {
    // Sembrar datos iniciales si la base está nueva
    await sembrarDatosIniciales(this.controlador);

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.enrutar(req, res));
      this.server.listen(puerto, '0.0.0.0', () => {
        const address = this.server?.address();
        const portAsignado = typeof address === 'object' && address ? address.port : puerto;
        const ipLocal = this.obtenerIpLocal();
        console.log(`[BibliaFinanciera] Servidor activo en http://localhost:${portAsignado}`);
        console.log(`[BibliaFinanciera] Acceso móvil local en http://${ipLocal}:${portAsignado}`);
        resolve(portAsignado);
      });
    });
  }


  public detener(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async enrutar(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // CORS headers para pruebas locales
    // CORS headers para pruebas locales
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    try {
      // --- ENDPOINTS TABLERO MENSUAL Y FONDEO POR BANCO ---
      if (pathname === '/api/tablero-mensual' && req.method === 'GET') {
        const mes = parsedUrl.searchParams.get('mes') || undefined;
        const data = await this.controlador.obtenerTableroMensual(mes);
        return this.responderJson(res, 200, data);
      }

      if (pathname === '/api/compromisos-mensuales' && req.method === 'POST') {
        const body = await this.leerBodyJson<any>(req);
        if (!body.id || !body.nombre || !body.id_cuenta_debito || !body.mes_ciclo) {
          return this.responderJson(res, 400, { error: 'Faltan campos obligatorios para el compromiso mensual' });
        }
        await this.controlador.guardarCompromisoMensual({
          id: body.id,
          id_cuenta_debito: body.id_cuenta_debito,
          mes_ciclo: body.mes_ciclo,
          nombre: body.nombre,
          categoria: body.categoria || 'General',
          monto: Number(body.monto || 0),
          moneda: body.moneda || 'ARS',
          dia_vencimiento_estimado: Number(body.dia_vencimiento_estimado || 1),
          fecha_vencimiento: body.fecha_vencimiento || `${body.mes_ciclo}-01`,
          estado: body.estado || 'PENDIENTE',
          fecha_pago: body.fecha_pago,
          es_recurrente: body.es_recurrente !== undefined ? !!body.es_recurrente : true,
          actualizado_en: new Date().toISOString()
        });
        return this.responderJson(res, 200, { exito: true });
      }

      if (pathname.startsWith('/api/compromisos-mensuales/') && req.method === 'PATCH') {
        const id = pathname.split('/')[3];
        const body = await this.leerBodyJson<{ monto?: number; fecha_vencimiento?: string; dia_vencimiento_estimado?: number }>(req);
        const monto = Number(body.monto || 0);
        const fecha = body.fecha_vencimiento || '';
        await this.controlador.actualizarMontoYVencimientoCompromiso(id, monto, fecha, body.dia_vencimiento_estimado);
        return this.responderJson(res, 200, { exito: true });
      }

      if (pathname.startsWith('/api/compromisos-mensuales/') && pathname.endsWith('/toggle-pago') && req.method === 'POST') {
        const partes = pathname.split('/');
        const id = partes[3];
        const body = await this.leerBodyJson<{ pagado?: boolean; fecha_pago?: string }>(req);
        await this.controlador.togglePagoCompromisoMensual(id, body.pagado, body.fecha_pago);
        return this.responderJson(res, 200, { exito: true });
      }

      if (pathname.startsWith('/api/compromisos-mensuales/') && req.method === 'DELETE') {
        const id = pathname.split('/')[3];
        await this.controlador.eliminarCompromisoMensual(id);
        return this.responderJson(res, 200, { exito: true });
      }

      if (pathname === '/api/compromisos-mensuales/clonar' && req.method === 'POST') {
        const body = await this.leerBodyJson<{ mesOrigen: string; mesDestino: string }>(req);
        if (!body.mesOrigen || !body.mesDestino) {
          return this.responderJson(res, 400, { error: 'Se requiere mesOrigen y mesDestino' });
        }
        const clonados = await this.controlador.clonarCompromisosAMes(body.mesOrigen, body.mesDestino);
        return this.responderJson(res, 200, { exito: true, clonados });
      }

      // --- ENDPOINTS DE SINCRONIZACIÓN Y RED LOCAL ---
      if (pathname === '/api/sync/exportar' && req.method === 'GET') {
        const paquete = await this.controlador.exportarPaqueteSincronizacion('PC');
        return this.responderJson(res, 200, paquete);
      }

      if (pathname === '/api/sync/importar' && req.method === 'POST') {
        const body = await this.leerBodyJson<{ paquete: any; modo?: 'SOBRESCRIBIR' | 'FUSIONAR' }>(req);
        if (!body.paquete) {
          return this.responderJson(res, 400, { error: 'Falta paquete de datos para sincronizar' });
        }
        const resultado = await this.controlador.aplicarPaqueteSincronizacion(body.paquete, body.modo || 'SOBRESCRIBIR');
        return this.responderJson(res, 200, { exito: true, resultado });
      }

      if (pathname === '/api/red/info' && req.method === 'GET') {
        const ip = this.obtenerIpLocal();
        const address = this.server?.address();
        const puerto = typeof address === 'object' && address ? address.port : 3000;
        return this.responderJson(res, 200, {
          ipLocal: ip,
          puerto,
          urlMovil: `http://${ip}:${puerto}`,
          timestampServidor: new Date().toISOString()
        });
      }

      // API Endpoints Existentes
      if (pathname === '/api/tesoreria' && req.method === 'GET') {
        const dias = parsedUrl.searchParams.get('dias') ? parseInt(parsedUrl.searchParams.get('dias')!, 10) : undefined;
        const reserva = parsedUrl.searchParams.get('reserva') ? parseFloat(parsedUrl.searchParams.get('reserva')!) : undefined;
        const data = await this.controlador.obtenerVistaTesoreria({ diasRestantes: dias, reservaContingencia: reserva });
        return this.responderJson(res, 200, data);
      }


      if (pathname === '/api/tarjetas' && req.method === 'GET') {
        const ingreso = parsedUrl.searchParams.get('ingreso') ? parseFloat(parsedUrl.searchParams.get('ingreso')!) : undefined;
        const data = await this.controlador.obtenerVistaTarjetas(ingreso);
        return this.responderJson(res, 200, data);
      }

      if (pathname === '/api/familia' && req.method === 'GET') {
        const dias = parsedUrl.searchParams.get('dias') ? parseInt(parsedUrl.searchParams.get('dias')!, 10) : 15;
        const data = await this.controlador.obtenerVistaFamilia(dias);
        return this.responderJson(res, 200, data);
      }

      if (pathname === '/api/auditoria' && req.method === 'GET') {
        const dias = parsedUrl.searchParams.get('dias') ? parseInt(parsedUrl.searchParams.get('dias')!, 10) : 15;
        const data = await this.controlador.obtenerVistaAuditoria(dias);
        return this.responderJson(res, 200, data);
      }

      if (pathname === '/api/ingesta' && req.method === 'POST') {
        const body = await this.leerBodyJson<{ texto: string }>(req);
        if (!body.texto) {
          return this.responderJson(res, 400, { error: 'El campo "texto" es obligatorio' });
        }
        const tx = await this.controlador.ingestarEntradaRapida(body.texto);
        return this.responderJson(res, 201, { exito: true, transaccion: tx });
      }

      if (pathname === '/api/extracto' && req.method === 'POST') {
        const body = await this.leerBodyJson<{
          contenidoCSV?: string;
          contenidoBase64?: string;
          nombreArchivo?: string;
          idTarjeta?: string;
        }>(req);

        if (body.contenidoBase64) {
          const resultado = await this.controlador.procesarPDFBase64(body.contenidoBase64, body.idTarjeta);
          return this.responderJson(res, 200, { exito: true, resultado });
        } else if (body.contenidoCSV) {
          const resultado = await this.controlador.procesarArchivoExtracto(body.contenidoCSV, body.idTarjeta);
          return this.responderJson(res, 200, { exito: true, resultado });
        } else {
          return this.responderJson(res, 400, { error: 'Se requiere contenidoCSV o contenidoBase64' });
        }
      }

      if (pathname === '/api/simulador-what-if' && req.method === 'POST') {
        const body = await this.leerBodyJson<{ montoTotal: number; cantidadCuotas: number }>(req);
        if (!body.montoTotal || !body.cantidadCuotas) {
          return this.responderJson(res, 400, { error: 'Se requiere montoTotal y cantidadCuotas' });
        }
        const simulacion = await this.controlador.simularCompraWhatIf(body.montoTotal, body.cantidadCuotas);
        return this.responderJson(res, 200, { exito: true, simulacion });
      }

      if (pathname === '/api/fondeo-bancos' && req.method === 'GET') {
        const data = await this.controlador.obtenerPrevisionFondeo();
        return this.responderJson(res, 200, data);
      }

      // --- ENDPOINTS ADMINISTRATIVOS (CRUD) ---

      // 1. Compromisos Fijos
      if (pathname === '/api/compromisos' && req.method === 'GET') {
        const data = await this.controlador.repoCompromisos.obtenerTodos();
        return this.responderJson(res, 200, data);
      }

      if (pathname === '/api/compromisos' && req.method === 'POST') {
        const body = await this.leerBodyJson<any>(req);
        if (!body.id || !body.nombre || body.monto === undefined) {
          return this.responderJson(res, 400, { error: 'Faltan campos obligatorios para el compromiso' });
        }
        await this.controlador.guardarCompromiso({
          id: body.id,
          nombre: body.nombre,
          monto: Number(body.monto),
          moneda: body.moneda || 'ARS',
          id_cuenta_debito: body.id_cuenta_debito || 'cta-santander',
          dia_vencimiento_estimado: Number(body.dia_vencimiento_estimado || 10),
          categoria: body.categoria || 'Vivienda',
          estado: body.estado || 'PENDIENTE'
        });
        return this.responderJson(res, 200, { exito: true });
      }

      if (pathname.startsWith('/api/compromisos/') && pathname.endsWith('/pagar') && req.method === 'POST') {
        const partes = pathname.split('/');
        const idCompromiso = partes[3];
        const body = await this.leerBodyJson<{ pagado?: boolean }>(req);
        await this.controlador.marcarCompromisoPagado(idCompromiso, body.pagado ?? true);
        return this.responderJson(res, 200, { exito: true });
      }

      if (pathname.startsWith('/api/compromisos/') && !pathname.endsWith('/pagar') && req.method === 'DELETE') {
        const id = pathname.split('/')[3];
        await this.controlador.eliminarCompromiso(id);
        return this.responderJson(res, 200, { exito: true });
      }

      // 2. Cuentas y Saldos
      if (pathname === '/api/cuentas' && req.method === 'GET') {
        const data = await this.controlador.repoCuentas.obtenerTodas();
        return this.responderJson(res, 200, data);
      }

      if (pathname === '/api/cuentas' && req.method === 'POST') {
        const body = await this.leerBodyJson<any>(req);
        if (!body.id || !body.nombre || !body.moneda) {
          return this.responderJson(res, 400, { error: 'Faltan campos obligatorios para la cuenta' });
        }
        await this.controlador.guardarCuenta({
          id: body.id,
          nombre: body.nombre,
          tipo_cuenta: body.tipo_cuenta || 'CAJA_AHORRO',
          moneda: body.moneda,
          saldo_actual: Number(body.saldo_actual || 0),
          identificadores_cuenta: body.identificadores_cuenta || {},
          es_reserva: !!body.es_reserva
        });
        return this.responderJson(res, 200, { exito: true });
      }

      if (pathname.startsWith('/api/cuentas/') && pathname.endsWith('/saldo') && req.method === 'POST') {
        const id = pathname.split('/')[3];
        const body = await this.leerBodyJson<{ saldo: number }>(req);
        if (body.saldo === undefined || isNaN(Number(body.saldo))) {
          return this.responderJson(res, 400, { error: 'Se requiere un saldo numérico válido' });
        }
        await this.controlador.actualizarSaldoCuenta(id, Number(body.saldo));
        return this.responderJson(res, 200, { exito: true });
      }

      if (pathname.startsWith('/api/cuentas/') && req.method === 'DELETE') {
        const id = pathname.split('/')[3];
        await this.controlador.eliminarCuenta(id);
        return this.responderJson(res, 200, { exito: true });
      }

      // 3. Tarjetas de Crédito
      if (pathname === '/api/tarjetas' && req.method === 'POST') {
        const body = await this.leerBodyJson<any>(req);
        if (!body.id || !body.banco_emisor || !body.marca_tarjeta || !body.ultimos_cuatro_digitos) {
          return this.responderJson(res, 400, { error: 'Faltan campos obligatorios para la tarjeta' });
        }
        await this.controlador.guardarTarjeta({
          id: body.id,
          banco_emisor: body.banco_emisor,
          marca_tarjeta: body.marca_tarjeta,
          ultimos_cuatro_digitos: String(body.ultimos_cuatro_digitos).slice(-4),
          dia_cierre_resumen: Number(body.dia_cierre_resumen || 20),
          dia_vencimiento_pago: Number(body.dia_vencimiento_pago || 28),
          id_cuenta_liquidacion: body.id_cuenta_liquidacion || 'cta-santander',
          fecha_cierre_actual: body.fecha_cierre_actual ? new Date(body.fecha_cierre_actual) : undefined,
          fecha_vencimiento_actual: body.fecha_vencimiento_actual ? new Date(body.fecha_vencimiento_actual) : undefined,
          saldo_pesos_resumen: body.saldo_pesos_resumen !== undefined && body.saldo_pesos_resumen !== '' ? Number(body.saldo_pesos_resumen) : undefined,
          saldo_dolares_resumen: body.saldo_dolares_resumen !== undefined && body.saldo_dolares_resumen !== '' ? Number(body.saldo_dolares_resumen) : undefined
        }, body.id_miembro_familiar);

        return this.responderJson(res, 200, { exito: true });
      }

      if (pathname.startsWith('/api/tarjetas/') && req.method === 'DELETE') {
        const id = pathname.split('/')[3];
        await this.controlador.eliminarTarjeta(id);
        return this.responderJson(res, 200, { exito: true });
      }

      // 4. Configuración de Parámetros de Tesorería
      if (pathname === '/api/configuracion' && req.method === 'GET') {
        return this.responderJson(res, 200, this.controlador.configTesoreria);
      }

      if (pathname === '/api/configuracion' && req.method === 'POST') {
        const body = await this.leerBodyJson<any>(req);
        const actualizada = this.controlador.actualizarConfiguracionTesoreria({
          reservaContingenciaMinima: body.reservaContingenciaMinima !== undefined ? Number(body.reservaContingenciaMinima) : undefined,
          diaCobroIngresoMensual: body.diaCobroIngresoMensual !== undefined ? Number(body.diaCobroIngresoMensual) : undefined,
          ingresoBaseEstimadoMensual: body.ingresoBaseEstimadoMensual !== undefined ? Number(body.ingresoBaseEstimadoMensual) : undefined
        });
        return this.responderJson(res, 200, { exito: true, config: actualizada });
      }

      // 5. Miembros Familiares
      if (pathname === '/api/miembros' && req.method === 'GET') {
        const data = await this.controlador.repoMiembros.obtenerTodos();
        return this.responderJson(res, 200, data);
      }

      if (pathname === '/api/miembros' && req.method === 'POST') {
        const body = await this.leerBodyJson<any>(req);
        if (!body.id || !body.nombre || !body.rol) {
          return this.responderJson(res, 400, { error: 'Faltan campos obligatorios para el miembro' });
        }
        await this.controlador.guardarMiembro({
          id: body.id,
          nombre: body.nombre,
          rol: body.rol,
          digitos_tarjetas_asignadas: body.digitos_tarjetas_asignadas || [],
          techo_presupuesto_mensual: body.techo_presupuesto_mensual ? Number(body.techo_presupuesto_mensual) : undefined,
          categorias_autorizadas: body.categorias_autorizadas || undefined
        });
        return this.responderJson(res, 200, { exito: true });
      }

      if (pathname.startsWith('/api/miembros/') && req.method === 'DELETE') {
        const id = pathname.split('/')[3];
        await this.controlador.eliminarMiembro(id);
        return this.responderJson(res, 200, { exito: true });
      }

      // Archivos Estáticos (SPA Web)
      let rutaArchivo = path.join(this.rutaPublic, pathname === '/' ? 'index.html' : pathname);
      if (!fs.existsSync(rutaArchivo) || fs.statSync(rutaArchivo).isDirectory()) {
        rutaArchivo = path.join(this.rutaPublic, 'index.html');
      }

      if (fs.existsSync(rutaArchivo)) {
        const ext = path.extname(rutaArchivo).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.svg': 'image/svg+xml'
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        fs.createReadStream(rutaArchivo).pipe(res);
        return;
      }

      this.responderJson(res, 404, { error: 'Ruta no encontrada' });
    } catch (error: any) {
      console.error('[BibliaFinanciera] Error procesando solicitud:', error);
      this.responderJson(res, 500, { error: error.message || 'Error interno del servidor' });
    }
  }

  private leerBodyJson<T>(req: http.IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : ({} as T));
        } catch (e) {
          reject(new Error('JSON inválido en el cuerpo de la solicitud'));
        }
      });
      req.on('error', reject);
    });
  }

  private responderJson(res: http.ServerResponse, status: number, data: any): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  }
}
