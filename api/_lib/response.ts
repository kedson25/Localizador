import type { ServerResponse } from 'http';

export interface ApiSuccessResponse<T = any> {
  ok: true;
  data: T;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: any;
}

export interface ApiErrorResponse {
  ok: false;
  error: ApiErrorDetail;
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

export function sendJson(
  res: any,
  statusCode: number,
  payload: ApiResponse
) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(payload);
  }

  // Compatibilidade com ServerResponse nativo do Node.js
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function sendSuccess<T>(res: any, data: T, statusCode = 200) {
  return sendJson(res, statusCode, {
    ok: true,
    data,
  });
}

export function sendError(
  res: any,
  statusCode: number,
  code: string,
  message: string,
  details?: any
) {
  // Mascara erros internos em produção para não expor stack traces sensíveis
  const safeMessage =
    statusCode >= 500 && process.env.NODE_ENV === 'production'
      ? 'Erro interno do servidor. Tente novamente mais tarde.'
      : message;

  return sendJson(res, statusCode, {
    ok: false,
    error: {
      code,
      message: safeMessage,
      ...(details ? { details } : {}),
    },
  });
}
