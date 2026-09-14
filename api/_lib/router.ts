import bipHandler from '../coleta/bip';
import itemHandler from '../coleta/item';
import itemsHandler from '../coleta/items';
import searchHandler from '../coleta/search';
import batchHandler from '../coleta/batch';
import statsHandler from '../coleta/stats';
import listasIndexHandler from '../listas/index';
import listaIdHandler from '../listas/[id]';
import reconcileHandler from '../listas/reconcile';
import signupHandler from '../auth/signup';
import loginHandler from '../auth/login';
import usersHandler from '../auth/users';
import refugoScansHandler from '../refugo/scans';
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

  // Roteamento
  if (urlPath === '/api/coleta/bip') {
    return bipHandler(req, res);
  }
  if (urlPath === '/api/coleta/item') {
    return itemHandler(req, res);
  }
  if (urlPath === '/api/coleta/items') {
    return itemsHandler(req, res);
  }
  if (urlPath === '/api/coleta/search') {
    return searchHandler(req, res);
  }
  if (urlPath === '/api/coleta/batch') {
    return batchHandler(req, res);
  }
  if (urlPath === '/api/coleta/stats') {
    return statsHandler(req, res);
  }
  if (urlPath === '/api/listas') {
    return listasIndexHandler(req, res);
  }
  if (urlPath === '/api/listas/reconcile') {
    return reconcileHandler(req, res);
  }
  if (urlPath.startsWith('/api/listas/')) {
    const id = urlPath.replace('/api/listas/', '');
    req.query = { ...(req.query || {}), id, listaId: id };
    return listaIdHandler(req, res);
  }
  if (urlPath === '/api/auth/signup') {
    return signupHandler(req, res);
  }
  if (urlPath === '/api/auth/login') {
    return loginHandler(req, res);
  }
  if (urlPath === '/api/auth/users') {
    return usersHandler(req, res);
  }
  if (urlPath === '/api/refugo/scans') {
    return refugoScansHandler(req, res);
  }
  if (urlPath === '/api/health') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
  }

  return sendError(res, 404, 'NOT_FOUND', `Rota de API não encontrada: ${urlPath}`);
}
