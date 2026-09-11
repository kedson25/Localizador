import 'fake-indexeddb/auto';
import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { disableNetwork, enableNetwork, terminate } from 'firebase/firestore';
import type { ColetaItem, ColetaLista } from '../src/types';
import { db } from '../src/lib/firebase';
import { listenToListas, saveLista, deleteLista, startListasSync, saveListaItems } from '../src/lib/coletaSync';
import { configureSyncTransport, getOutboxMetrics, startOutboxSync, subscribeSyncStatus } from '../src/lib/offlineQueue';
import { createFirestoreTransport } from '../src/lib/firestoreTransport';

let online = true;
const page = new EventTarget();
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get onLine() { return online; } } });
Object.defineProperty(globalThis, 'window', { configurable: true, value: page });
for (const name of ['localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error(`${name} is forbidden in operational paths`); } });
}
// Each worker represents a different computer; browser-tab broadcasts must not
// turn independent machines into a shared local storage environment.
Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: undefined });

configureSyncTransport(createFirestoreTransport(db));
const stopOutbox = startOutboxSync();
const stopSync = startListasSync();
const stopStatus = subscribeSyncStatus(status => parentPort!.postMessage({ event: 'status', status }));
const lists = new Map<string, ColetaLista>();
let publications = 0;
const stopListener = listenToListas(next => {
  lists.clear();
  for (const list of next) lists.set(list.id, list);
  publications++;
  parentPort!.postMessage({ event: 'snapshot', counts: Object.fromEntries(next.map(list => [list.id, list.itens.length])), publications });
});

function item(code: string, changes: Partial<ColetaItem> = {}): ColetaItem {
  return { id: code, codigo: code, rota: 'R1', saida: 'AM', motivo: 'Coleta', scannedAt: '2026-09-10T12:00:00.000Z', responsavel: workerData.name, ...changes };
}

parentPort!.on('message', async ({ request, command, args = {} }) => {
  try {
    let result: unknown;
    switch (command) {
      case 'create': {
        const list: ColetaLista = { id: args.id, nome: args.id, rota: 'R1', data: '2026-09-10', responsavel: 'Operador', status: 'em_andamento', saidaPadrao: 'AM', motivoPadrao: 'Coleta', itens: [] };
        result = await saveLista(list);
        break;
      }
      case 'scan': {
        const durations: number[] = [];
        const accepted: Promise<boolean>[] = [];
        const start = performance.now();
        for (const code of args.codes as string[]) {
          const before = performance.now();
          accepted.push(saveListaItems(args.id, [item(code)]));
          durations.push(performance.now() - before);
        }
        const synchronousMs = performance.now() - start;
        const results = await Promise.all(accepted);
        const acceptedMs = performance.now() - start;
        const sorted = [...durations].sort((a, b) => a - b);
        result = { count: results.length, accepted: results.filter(Boolean).length, synchronousMs, acceptedMs,
          p95Ms: sorted[Math.floor(sorted.length * 0.95)] || 0,
          firstQuarterMeanMs: durations.slice(0, Math.ceil(durations.length / 4)).reduce((sum, value) => sum + value, 0) / Math.ceil(durations.length / 4),
          lastQuarterMeanMs: durations.slice(-Math.ceil(durations.length / 4)).reduce((sum, value) => sum + value, 0) / Math.ceil(durations.length / 4),
          publications, heapBytes: process.memoryUsage().heapUsed };
        break;
      }
      case 'update': {
        const current = lists.get(args.id);
        if (!current) throw new Error(`List not visible in ${workerData.name}: ${args.id}`);
        result = await saveLista({ ...current, ...args.patch });
        break;
      }
      case 'item': {
        result = await saveListaItems(args.id, [item(args.code, args.patch)]);
        break;
      }
      case 'remove': result = await saveListaItems(args.id, [], args.ids); break;
      case 'delete': result = await deleteLista(args.id); break;
      case 'offline': online = false; page.dispatchEvent(new Event('offline')); await disableNetwork(db); result = true; break;
      case 'online': await enableNetwork(db); online = true; page.dispatchEvent(new Event('online')); result = true; break;
      case 'metrics': result = await getOutboxMetrics(); break;
      case 'inspect': {
        const current = lists.get(args.id);
        if (!current) { result = null; break; }
        const ordered = current.itens.map(({ syncStatus: _status, ...entry }) => entry).sort((a, b) => a.id.localeCompare(b.id));
        result = { ...current, itens: undefined, count: ordered.length, uniqueIds: new Set(ordered.map(entry => entry.id)).size,
          uniqueCodes: new Set(ordered.map(entry => entry.codigo)).size,
          digest: createHash('sha256').update(JSON.stringify(ordered)).digest('hex'),
          codes: ordered.map(entry => entry.codigo), item: args.code ? ordered.find(entry => entry.codigo === args.code) : undefined };
        break;
      }
      case 'close': stopListener(); stopStatus(); stopSync(); stopOutbox(); await terminate(db); result = true; break;
      default: throw new Error(`Unknown test command: ${command}`);
    }
    parentPort!.postMessage({ request, result });
    if (command === 'close') parentPort!.close();
  } catch (error) {
    parentPort!.postMessage({ request, error: error instanceof Error ? error.stack : String(error) });
  }
});
parentPort!.postMessage({ event: 'ready' });
