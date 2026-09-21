import { normalizeCodigo, cleanDigits, getDeterministicItemId } from './id';

export function itemFromRow(row: any) {
  return {
    id: String(row.id),
    codigo: String(row.codigo || ''),
    codigoClean: String(row.codigo_clean || ''),
    rota: String(row.rota || 'Sem Rota'),
    saida: String(row.saida || 'Ciclo 2 - Saída PM'),
    motivo: String(row.motivo || 'Pendente'),
    scannedAt: String(row.scanned_at || ''),
    responsavel: row.responsavel || undefined,
    grupoId: row.grupo_id || undefined,
    validado: Boolean(row.validado),
    timestamp: Number(row.timestamp || 0),
  };
}

export function itemToRow(
  listaId: string,
  item: any,
  defaults: any = {},
  forcedId?: string
) {
  const codigo = normalizeCodigo(item.codigo || '');
  const id = forcedId || item.id || getDeterministicItemId(codigo);

  return {
    lista_id: listaId,
    id,
    codigo,
    codigo_clean: item.codigoClean || cleanDigits(codigo),
    rota: item.rota || defaults.rota || 'Sem Rota',
    saida: item.saida || defaults.saidaPadrao || 'Ciclo 2 - Saída PM',
    motivo: item.motivo || defaults.motivoPadrao || 'Pendente',
    scanned_at: item.scannedAt || new Date().toLocaleString('pt-BR'),
    responsavel: item.responsavel || 'Operador',
    grupo_id: item.grupoId || null,
    validado: item.validado === true,
    timestamp: item.timestamp || Date.now(),
    updated_at: new Date().toISOString(),
  };
}

export function listaFromRow(row: any) {
  return {
    id: String(row.id),
    nome: String(row.nome || ''),
    tipo: row.tipo || 'comum',
    grupos: Array.isArray(row.grupos) ? row.grupos : [],
    grupoAtivoId: row.grupo_ativo_id || undefined,
    rota: String(row.rota || ''),
    data: String(row.data || ''),
    saida: row.saida || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    responsavel: String(row.responsavel || ''),
    status: row.status === 'finalizada' ? 'finalizada' : 'em_andamento',
    saidaPadrao: String(row.saida_padrao || 'Ciclo 2 - Saída PM'),
    motivoPadrao: String(row.motivo_padrao || 'Pendente'),
    totalItens: Number(row.total_itens || 0),
    totalValidados: Number(row.total_validados || 0),
    saidasCount: row.saidas_count || {},
    motivosCount: row.motivos_count || {},
    rotasCount: row.rotas_count || {},
    bipsPorOperador: row.bips_por_operador || {},
    porcentagemAcerto:
      row.porcentagem_acerto === null || row.porcentagem_acerto === undefined
        ? undefined
        : Number(row.porcentagem_acerto),
    fechamentoGaiola: row.fechamento_gaiola || undefined,
    itensFaltaram:
      row.itens_faltaram === null || row.itens_faltaram === undefined
        ? undefined
        : Number(row.itens_faltaram),
    itens: [],
  };
}

export function listaPatchToRow(input: any) {
  const out: Record<string, any> = {};
  const pairs: Array<[string, string]> = [
    ['nome', 'nome'],
    ['tipo', 'tipo'],
    ['grupos', 'grupos'],
    ['grupoAtivoId', 'grupo_ativo_id'],
    ['rota', 'rota'],
    ['data', 'data'],
    ['saida', 'saida'],
    ['responsavel', 'responsavel'],
    ['status', 'status'],
    ['saidaPadrao', 'saida_padrao'],
    ['motivoPadrao', 'motivo_padrao'],
    ['porcentagemAcerto', 'porcentagem_acerto'],
    ['fechamentoGaiola', 'fechamento_gaiola'],
    ['itensFaltaram', 'itens_faltaram'],
  ];

  for (const [source, target] of pairs) {
    if (input[source] !== undefined) out[target] = input[source];
  }

  out.updated_at = new Date().toISOString();
  return out;
}
