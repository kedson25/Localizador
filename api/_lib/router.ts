import coletaRouter from '../coleta';
import listasRouter from '../listas';
import authRouter from '../auth';
import refugoRouter from '../refugo';
import indexRouter from '../index';
import { sendError } from './response';

export async function dispatchApiRoute(req: any, res: any) {
  const urlPath = (req.url || '').split('?')[0].replace(/\/+$/, '');
  
  // Extrair query params se ainda não parseados
  if (!req.query && req.url && req.url.includes('?')) {
    const queryString = req.url.split('?')[1];
    const params = new URLSearchParams(queryString);
    req.query = Object.fromEntries(params.entries());
  }

  // Parsear body se for stream
  if (!req.body && req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      const data = Buffer.concat(buffers).toString();
      if (data) {
        req.body = JSON.parse(data);
      } else {
        req.body = {};
      }
    } catch (_) {
      req.body = {};
    }
  }

  // Roteamento ajustado para o novo modelo
  if (urlPath === '/api/coleta') return coletaRouter(req, res);
  if (urlPath === '/api/listas') return listasRouter(req, res);
  if (urlPath === '/api/auth') return authRouter(req, res);
  if (urlPath === '/api/refugo') return refugoRouter(req, res);
  if (urlPath === '/api/health' || urlPath === '/api') return indexRouter(req, res);
  
  return sendError(res, 404, 'NOT_FOUND', `Rota de API não encontrada: ${urlPath}`);
}
