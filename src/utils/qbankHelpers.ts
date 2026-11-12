import type {
  ImportIssue,
  StudentRegistrationRequest,
  SubjectModule,
} from '../types';
import { buildXlsxBuffer, parseXlsxBuffer } from './xlsxCodec';

export function formatModuleUnit(unit: number): string {
  const n = Number(unit);
  if (n >= 1 && n <= 5) return `Module ${n}`;
  const base = Math.floor(n / 10);
  const part = n % 10;
  if (base >= 1 && base <= 5 && (part === 1 || part === 2)) {
    return `Module ${base} (${part === 1 ? '1st Half' : '2nd Half'})`;
  }
  return `Module ${n}`;
}

export function formatModuleShort(unit: number): string {
  const n = Number(unit);
  if (n >= 1 && n <= 5) return `M${n}`;
  const base = Math.floor(n / 10);
  const part = n % 10;
  if (base >= 1 && base <= 5 && (part === 1 || part === 2)) {
    return `M${base}${part === 1 ? 'A' : 'B'}`;
  }
  return `M${n}`;
}

export function moduleUnitWeight(unit: number): number {
  const n = Number(unit);
  return n >= 1 && n <= 5 ? 2 : Math.floor(n / 10) >= 1 ? 1 : 0;
}

export function computeAvailableQuestions(
  unit: number,
  byNum: Record<number, SubjectModule | undefined>
): { available: number; ready: boolean } {
  const direct = byNum[unit];
  if (direct && direct.status === 'READY' && direct.questionCount > 0) {
    return { available: direct.questionCount, ready: true };
  }
  if (unit >= 1 && unit <= 5) {
    const h1 = byNum[unit * 10 + 1];
    const h2 = byNum[unit * 10 + 2];
    if (
      h1 &&
      h1.status === 'READY' &&
      h1.questionCount > 0 &&
      h2 &&
      h2.status === 'READY' &&
      h2.questionCount > 0
    ) {
      return { available: h1.questionCount + h2.questionCount, ready: true };
    }
  }
  return { available: 0, ready: false };
}

export function sortedPreviewIssues(issues: ImportIssue[] | undefined | null): ImportIssue[] {
  const rank: Record<string, number> = { ERROR: 0, WARNING: 1, INFO: 2 };
  return [...(issues || [])].sort((a, b) => {
    const ra = rank[a.severity] ?? 3;
    const rb = rank[b.severity] ?? 3;
    return ra !== rb ? ra - rb : (a.row || 0) - (b.row || 0);
  });
}

export function formatInstant(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '-';
  const d = typeof v === 'number' ? new Date(v > 1e12 ? v : v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

export function toLocalDatetimeValue(d: Date): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface ParsedRosterUpload {
  students: StudentRegistrationRequest[];
  warnings: string[];
}

function normalizeHeader(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      current.push(cell.trim());
      cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      current.push(cell.trim());
      if (current.some((c) => c !== '')) rows.push(current);
      current = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || current.length > 0) {
    current.push(cell.trim());
    if (current.some((c) => c !== '')) rows.push(current);
  }
  return rows;
}

function parseOptionalInt(val: unknown): number | null {
  const s = String(val ?? '').trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function parseBool(val: unknown): boolean {
  const s = String(val ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === '1';
}

export function parseRosterRows(matrix: (string | number | boolean | null | undefined)[][]): ParsedRosterUpload {
  if (!matrix || matrix.length < 2) {
    return { students: [], warnings: ['Spreadsheet has no data rows below the header.'] };
  }

  const headerNorms = matrix[0].map((h) => normalizeHeader(String(h ?? '')));
  const findCol = (aliases: string[]): number =>
    headerNorms.findIndex((h) => aliases.includes(h));

  const rollCol = findCol(['rollnumber', 'rollno', 'roll', 'usn', 'studentid', 'regno']);
  const nameCol = findCol(['fullname', 'name', 'studentname', 'candidatename']);
  const roomCol = findCol(['roomcode', 'room', 'hall', 'hallcode', 'classroom']);
  const rowCol = findCol(['rownumber', 'row', 'rowno']);
  const seatCol = findCol(['seatnumber', 'seat', 'seatno']);
  const scaleCol = findCol(['fontscale', 'zoom', 'scale']);
  const hcCol = findCol(['highcontrast', 'contrast']);
  const extraCol = findCol(['accommodationextraminutes', 'extraminutes', 'extra', 'extratime']);

  if (rollCol < 0 || nameCol < 0) {
    return {
      students: [],
      warnings: ['Missing required columns: Roll Number (rollNumber/usn) and Full Name (fullName/name).'],
    };
  }

  const students: StudentRegistrationRequest[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row || row.every((c) => String(c ?? '').trim() === '')) continue;

    const rollNumber = String(row[rollCol] ?? '').trim();
    const fullName = String(row[nameCol] ?? '').trim();
    if (!rollNumber || !fullName) {
      warnings.push(`Row ${i + 1}: skipped because rollNumber or fullName is empty.`);
      continue;
    }
    const key = rollNumber.toUpperCase();
    if (seen.has(key)) {
      warnings.push(`Row ${i + 1}: duplicate roll number "${rollNumber}" skipped.`);
      continue;
    }
    seen.add(key);

    const roomCode = roomCol >= 0 ? String(row[roomCol] ?? '').trim() || 'MAIN' : 'MAIN';
    const rawScale = scaleCol >= 0 ? Number.parseFloat(String(row[scaleCol] ?? '')) : NaN;
    const fontScale = Number.isFinite(rawScale) && rawScale >= 0.8 && rawScale <= 2.0 ? rawScale : 1.0;
    const extraMins = extraCol >= 0 ? Math.max(0, parseOptionalInt(row[extraCol]) ?? 0) : 0;

    students.push({
      rollNumber,
      fullName,
      roomCode,
      rowNumber: rowCol >= 0 ? parseOptionalInt(row[rowCol]) : null,
      seatNumber: seatCol >= 0 ? parseOptionalInt(row[seatCol]) : null,
      fontScale,
      highContrast: hcCol >= 0 ? parseBool(row[hcCol]) : false,
      accommodationExtraMinutes: extraMins,
    });
  }

  return { students, warnings };
}

export async function parseRosterSpreadsheetFile(file: File): Promise<ParsedRosterUpload> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv')) {
    const text = await file.text();
    return parseRosterRows(parseCsvMatrix(text));
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const wb = parseXlsxBuffer(bytes);
  return parseRosterRows(wb.rows);
}

export function buildRosterTemplateXlsx(): Uint8Array {
  return buildXlsxBuffer({
    sheetName: 'StudentRoster',
    headers: [
      'rollNumber',
      'fullName',
      'roomCode',
      'rowNumber',
      'seatNumber',
      'fontScale',
      'highContrast',
      'accommodationExtraMinutes',
    ],
    rows: [
      ['1JT23CS001', 'Aarav Sharma', 'LH-101', 1, 1, 1.0, false, 0],
      ['1JT23CS002', 'Diya Rao', 'LH-101', 1, 2, 1.2, true, 15],
    ],
  });
}
