const fs = require('fs');

let code = fs.readFileSync('src/utils/csvParser.ts', 'utf8');

const normalizeFunc = `
export function normalizeTrackingCode(codigo: string): string {
  if (!codigo) return '';
  const cleaned = cleanTrackingId(codigo);
  const digits = cleanDigits(cleaned);
  return digits || cleaned || codigo.trim().toUpperCase().replace(/M$/i, '');
}
`;

code = code.replace(/export function cleanTrackingId/g, normalizeFunc + '\nexport function cleanTrackingId');

fs.writeFileSync('src/utils/csvParser.ts', code);
