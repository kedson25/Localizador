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

export type ActiveTab = 'lookup' | 'remove' | 'upload';
