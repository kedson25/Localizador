import { RefugoScan, addRefugoScan } from '../lib/firebase';

export interface QueueItem {
  scan: Omit<RefugoScan, 'firestoreId'>;
  retries: number;
  addedAt: number;
}

/**
 * Fila de sincronização em memória para gravações do Refugo no Firestore.
 * 
 * - O scanner aceita o bip imediatamente (< 2ms) e enfileira aqui.
 * - Sincroniza em background sem travar a UI ou o próximo bip.
 * - Concorrência controlada (2 a 4 conexões simultâneas).
 * - Retry automático com backoff exponencial curto em erros temporários.
 * - Evita duplicidades na fila pelo normalizedId.
 * - Não usa localStorage/IndexedDB.
 * - Em falhas definitivas, notifica discretamente via callback sem bloquear o operador.
 */
export class RefugoSyncQueue {
  private queue: QueueItem[] = [];
  private queuedIds = new Set<string>();
  private activeWrites = new Set<string>();
  private maxConcurrency: number = 3;
  private maxRetries: number = 3;
  private onSyncError?: (error: Error, scan: Omit<RefugoScan, 'firestoreId'>) => void;
  private onSyncSuccess?: (scan: Omit<RefugoScan, 'firestoreId'>) => void;
  private onQueueChange?: (pendingCount: number) => void;

  constructor(options?: {
    maxConcurrency?: number;
    maxRetries?: number;
    onSyncError?: (error: Error, scan: Omit<RefugoScan, 'firestoreId'>) => void;
    onSyncSuccess?: (scan: Omit<RefugoScan, 'firestoreId'>) => void;
    onQueueChange?: (pendingCount: number) => void;
  }) {
    if (options?.maxConcurrency) this.maxConcurrency = options.maxConcurrency;
    if (options?.maxRetries) this.maxRetries = options.maxRetries;
    this.onSyncError = options?.onSyncError;
    this.onSyncSuccess = options?.onSyncSuccess;
    this.onQueueChange = options?.onQueueChange;
  }

  public setCallbacks(callbacks: {
    onSyncError?: (error: Error, scan: Omit<RefugoScan, 'firestoreId'>) => void;
    onSyncSuccess?: (scan: Omit<RefugoScan, 'firestoreId'>) => void;
    onQueueChange?: (pendingCount: number) => void;
  }): void {
    if (callbacks.onSyncError) this.onSyncError = callbacks.onSyncError;
    if (callbacks.onSyncSuccess) this.onSyncSuccess = callbacks.onSyncSuccess;
    if (callbacks.onQueueChange) this.onQueueChange = callbacks.onQueueChange;
  }

  public enqueue(scan: Omit<RefugoScan, 'firestoreId'>): void {
    const id = scan.normalizedId;
    if (!id) return;

    // Se já está na fila de espera aguardando envio, atualiza o item existente
    const existingIndex = this.queue.findIndex(item => item.scan.normalizedId === id);
    if (existingIndex >= 0) {
      this.queue[existingIndex].scan = scan;
      return;
    }

    this.queue.push({
      scan,
      retries: 0,
      addedAt: Date.now()
    });
    this.queuedIds.add(id);

    this.notifyQueueChange();
    this.scheduleProcess();
  }

  public cancel(normalizedId: string): void {
    this.queue = this.queue.filter(item => item.scan.normalizedId !== normalizedId);
    this.queuedIds.delete(normalizedId);
    this.notifyQueueChange();
  }

  public clear(): void {
    this.queue = [];
    this.queuedIds.clear();
    this.notifyQueueChange();
  }

  public getPendingCount(): number {
    return this.queue.length + this.activeWrites.size;
  }

  private notifyQueueChange(): void {
    if (this.onQueueChange) {
      try {
        this.onQueueChange(this.getPendingCount());
      } catch (_) {}
    }
  }

  private scheduleProcess(): void {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(() => this.processNext());
    } else {
      setTimeout(() => this.processNext(), 0);
    }
  }

  private async processNext(): Promise<void> {
    if (this.activeWrites.size >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    const id = item.scan.normalizedId;
    this.queuedIds.delete(id);
    this.activeWrites.add(id);
    this.notifyQueueChange();

    // Inicia concorrentemente outro item se houver capacidade disponível
    if (this.activeWrites.size < this.maxConcurrency && this.queue.length > 0) {
      this.scheduleProcess();
    }

    try {
      await addRefugoScan(item.scan);
      this.activeWrites.delete(id);
      this.notifyQueueChange();
      if (this.onSyncSuccess) {
        this.onSyncSuccess(item.scan);
      }
    } catch (err: any) {
      this.activeWrites.delete(id);
      this.notifyQueueChange();

      if (item.retries < this.maxRetries) {
        // Backoff exponencial curto: 300ms, 600ms, 1200ms
        const delay = Math.min(1500, 300 * Math.pow(2, item.retries));
        item.retries++;
        setTimeout(() => {
          // Só reinsere se o item não estiver atualmente em escrita ou cancelado
          if (!this.activeWrites.has(id)) {
            this.queue.push(item);
            this.queuedIds.add(id);
            this.notifyQueueChange();
            this.scheduleProcess();
          }
        }, delay);
      } else {
        console.warn(`[RefugoSyncQueue] Falha definitiva na sincronização do item ${id}:`, err);
        if (this.onSyncError) {
          this.onSyncError(err instanceof Error ? err : new Error(String(err)), item.scan);
        }
      }
    } finally {
      this.scheduleProcess();
    }
  }
}
