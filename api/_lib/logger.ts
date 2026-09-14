export interface LogContext {
  requestId?: string;
  endpoint?: string;
  method?: string;
  uid?: string;
  listaId?: string;
  durationMs?: number;
  status?: number;
  errorCode?: string;
  [key: string]: any;
}

export function logApi(level: 'info' | 'warn' | 'error', message: string, context?: LogContext) {
  const sanitizedContext: Record<string, any> = {};

  if (context) {
    for (const [key, value] of Object.entries(context)) {
      // Bloqueia campos sensíveis
      if (/password|senha|token|secret|private|authorization/i.test(key)) {
        sanitizedContext[key] = '[REDACTED]';
      } else {
        sanitizedContext[key] = value;
      }
    }
  }

  const logPayload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...sanitizedContext,
  };

  if (level === 'error') {
    console.error(JSON.stringify(logPayload));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(logPayload));
  } else {
    console.log(JSON.stringify(logPayload));
  }
}
