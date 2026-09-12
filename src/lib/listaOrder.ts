import type { ColetaLista } from '../types';

function listaTimestamp(lista: ColetaLista): number {
  const createdAt = Date.parse(lista.created_at || '');
  if (Number.isFinite(createdAt)) return createdAt;

  const idTimestamp = Number(lista.id.match(/^lista-(\d{13,})$/)?.[1]);
  if (Number.isFinite(idTimestamp) && idTimestamp > 0) return idTimestamp;

  const isoDate = lista.data?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) return new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3])).getTime();

  const brazilianDate = lista.data?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brazilianDate) {
    return new Date(Number(brazilianDate[3]), Number(brazilianDate[2]) - 1, Number(brazilianDate[1])).getTime();
  }
  return 0;
}

export function compareListasNewestFirst(left: ColetaLista, right: ColetaLista): number {
  return listaTimestamp(right) - listaTimestamp(left) || right.id.localeCompare(left.id);
}
