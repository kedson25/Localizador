export interface CsvRow {
  id: string;
  originalId: string;
  cleanId: string;
  group: string;
  saida?: string;
  motivo?: string;
  reversao?: string;
  statusGp?: string;
  substatusGp?: string;
  valor?: string;
  cluster?: string;
  tipoEndereco?: string;
  promessa?: string;
  diasDelay?: string;
  statusDelay?: string;
  concat?: string;
  rawFields: Record<string, string>;
  rowIndex: number;
}

export interface GroupSummary {
  name: string;
  count: number;
  rows: CsvRow[];
}

export interface LookupMatch {
  searchTerm: string;
  cleanSearchTerm: string;
  found: boolean;
  row?: CsvRow;
  matchedGroup?: string;
}

export interface RefugoRow {
  id: string;
  rota: string;
  rawFields: Record<string, string>;
}

export interface ColetaItem {
  id: string;
  codigo: string;
  rota: string;
  saida: string;
  motivo: string;
  scannedAt: string;
  responsavel?: string;
  grupoId?: string;
  validado?: boolean;
  syncStatus?: 'pendente' | 'sincronizando' | 'sincronizado';
}

export interface ColetaGrupo {
  id: string;
  nome: string;
  lider: string;
}

export interface ColetaLista {
  id: string;
  nome: string;
  tipo?: 'comum' | 'grupos';
  grupos?: ColetaGrupo[];
  grupoAtivoId?: string;
  rota: string;
  data: string;
  responsavel: string;
  status: 'em_andamento' | 'finalizada';
  saidaPadrao: string;
  motivoPadrao: string;
  itens: ColetaItem[];
  totalItens?: number;
  porcentagemAcerto?: number;
  fechamentoGaiola?: string;
  itensFaltaram?: number;
}

export type ActiveTab = 'tools' | 'lookup' | 'remove' | 'report' | 'upload' | 'refugo';
