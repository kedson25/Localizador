import { CsvRow, GroupSummary, LookupMatch } from '../types';

export function cleanDigits(str: string): string {
  if (!str) return '';
  // Extract digits only
  const digits = str.replace(/\D/g, '');
  return digits.length > 0 ? digits : str.trim();
}

export function detectDelimiter(text: string): string {
  const lines = text.split('\n').filter((l) => l.trim().length > 0).slice(0, 5);
  let tabs = 0;
  let semicolons = 0;
  let commas = 0;

  for (const line of lines) {
    tabs += (line.match(/\t/g) || []).length;
    semicolons += (line.match(/;/g) || []).length;
    commas += (line.match(/,/g) || []).length;
  }

  if (tabs >= semicolons && tabs >= commas && tabs > 0) return '\t';
  if (semicolons >= commas && semicolons > 0) return ';';
  return ',';
}

export function parseCsvText(rawText: string): { rows: CsvRow[]; groups: GroupSummary[]; headers: string[] } {
  if (!rawText || !rawText.trim()) {
    return { rows: [], groups: [], headers: [] };
  }

  const delimiter = detectDelimiter(rawText);
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], groups: [], headers: [] };
  }

  // Parse header
  let headers: string[] = [];
  let startIndex = 0;

  const firstLineCells = lines[0].split(delimiter).map((c) => c.trim());
  const isHeader = firstLineCells.some(
    (cell) =>
      cell.toUpperCase().includes('ID') ||
      cell.toUpperCase().includes('SAÍDA') ||
      cell.toUpperCase().includes('SAIDA') ||
      cell.toUpperCase().includes('MOTIVO') ||
      cell.toUpperCase().includes('STATUS')
  );

  if (isHeader) {
    headers = firstLineCells;
    startIndex = 1;
  } else {
    headers = ['ID', 'Saída', 'MOTIVO', 'Reversão', 'STATUS GP', 'SUBSTATUS GP', 'VALOR', 'CLUSTER', 'TIPO DE ENDEREÇO', 'PROMESSA', 'DIAS DE DELAY', 'STATUS DELAY', 'Concat'];
    startIndex = 0;
  }

  const rows: CsvRow[] = [];
  let currentGroup = 'GRUPO 1';
  let rowIndexCounter = 0;

  const groupRegex = /^\s*((?:GRUPO|CPG|SACOLA|SACOLAS|SAC|GROUP)\s*[-_]?\s*[A-Za-z0-9_-]+)/i;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.split(delimiter).map((c) => c.trim());

    if (cells.length === 0) continue;

    const firstCell = cells[0] || '';

    // Check if line represents a group header declaration
    const groupMatch = firstCell.match(groupRegex) || line.match(groupRegex);
    
    if (groupMatch) {
      // Update active group name
      currentGroup = groupMatch[1].toUpperCase();

      // Check if this row is purely a group marker or has additional row data
      const nonGroupCells = cells.slice(1).filter((c) => c.length > 0);
      
      // If cell 0 is just "GRUPO X" and no numeric ID in first cell, we skip adding this row as a data row unless it has an ID
      const digitsInFirstCell = cleanDigits(firstCell);
      if (digitsInFirstCell.length < 5 && nonGroupCells.length === 0) {
        continue;
      }
      
      // If it has digits or non-group cell data, it might also be a data row
      if (digitsInFirstCell.length < 5 && nonGroupCells.length > 0) {
        // e.g. "GRUPO 2", "Saída PM", "Etiqueta Branca", ...
        // We set group to "GRUPO 2" and don't insert a fake ID row if ID is just "GRUPO 2"
        continue;
      }
    }

    const rawId = firstCell;
    const cleanId = cleanDigits(rawId);

    // Filter out rows that are purely header repetitions or empty
    if (rawId.toUpperCase() === 'ID' || rawId.toUpperCase().includes('HEADER')) {
      continue;
    }

    // Identify if ID consists of exactly 11 numeric digits (e.g. 47712645205)
    // Whatever is different is separated into group 'ERROS'
    const is11Digits = /^\d{11}$/.test(cleanId);
    const assignedGroup = is11Digits ? currentGroup : 'ERROS';

    // Build raw fields mapping
    const rawFields: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rawFields[h] = cells[idx] || '';
    });

    // Specific mapped fields based on header position/name
    const getVal = (name: string, defaultIdx: number) => {
      const foundKey = Object.keys(rawFields).find((k) => k.toUpperCase().includes(name.toUpperCase()));
      if (foundKey && rawFields[foundKey]) return rawFields[foundKey];
      return cells[defaultIdx] || '';
    };

    const rowObj: CsvRow = {
      id: rawId,
      originalId: rawId,
      cleanId: cleanId,
      group: assignedGroup,
      saida: getVal('Saída', 1) || getVal('Saida', 1),
      motivo: getVal('MOTIVO', 2),
      reversao: getVal('Reversão', 3) || getVal('Reversao', 3),
      statusGp: getVal('STATUS GP', 4),
      substatusGp: getVal('SUBSTATUS GP', 5),
      valor: getVal('VALOR', 6),
      cluster: getVal('CLUSTER', 7),
      tipoEndereco: getVal('TIPO', 8),
      promessa: getVal('PROMESSA', 9),
      diasDelay: getVal('DIAS', 10),
      statusDelay: getVal('DELAY', 11),
      concat: getVal('Concat', 12) || cells[cells.length - 1] || '',
      rawFields,
      rowIndex: rowIndexCounter++,
    };

    rows.push(rowObj);
  }

  // Create groups summary
  const groupMap = new Map<string, CsvRow[]>();
  rows.forEach((r) => {
    if (!groupMap.has(r.group)) {
      groupMap.set(r.group, []);
    }
    groupMap.get(r.group)!.push(r);
  });

  const groups: GroupSummary[] = Array.from(groupMap.entries())
    .map(([name, groupRows]) => ({
      name,
      count: groupRows.length,
      rows: groupRows,
    }))
    .sort((a, b) => {
      if (a.name === 'ERROS') return 1;
      if (b.name === 'ERROS') return -1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

  return { rows, groups, headers };
}

export function searchIdsInRows(inputQuery: string, rows: CsvRow[]): LookupMatch[] {
  if (!inputQuery || !inputQuery.trim() || rows.length === 0) {
    return [];
  }

  // Split input query by newlines, commas, semicolons, tabs, spaces
  const terms = inputQuery
    .split(/[\n\r,;\t\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const results: LookupMatch[] = [];
  const processedTerms = new Set<string>();

  for (const term of terms) {
    if (processedTerms.has(term)) continue;
    processedTerms.add(term);

    const cleanTerm = cleanDigits(term);

    // Exact match or clean digit match
    const matchedRow = rows.find((r) => {
      if (r.id === term || r.originalId === term) return true;
      if (cleanTerm.length > 0 && r.cleanId === cleanTerm) return true;
      if (r.id.includes(term)) return true;
      if (r.concat && (r.concat === term || cleanDigits(r.concat) === cleanTerm)) return true;
      return false;
    });

    if (matchedRow) {
      results.push({
        searchTerm: term,
        cleanSearchTerm: cleanTerm,
        found: true,
        row: matchedRow,
        matchedGroup: matchedRow.group,
      });
    } else {
      results.push({
        searchTerm: term,
        cleanSearchTerm: cleanTerm,
        found: false,
      });
    }
  }

  return results;
}

export function exportToCsv(rows: CsvRow[], headers: string[]): string {
  const exportHeaders = ['GRUPO', ...headers.filter((h) => h.toUpperCase() !== 'GRUPO')];
  const lines: string[] = [];

  lines.push(exportHeaders.join('\t'));

  for (const row of rows) {
    const lineCells = exportHeaders.map((h) => {
      if (h === 'GRUPO') return row.group;
      return row.rawFields[h] || '';
    });
    lines.push(lineCells.join('\t'));
  }

  return lines.join('\n');
}
