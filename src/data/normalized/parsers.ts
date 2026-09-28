import type { Metadata } from './types';

export function optionalText(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

export function optionalNumber(value: unknown): number | undefined {
  const text = optionalText(value);
  if (text == null) return undefined;
  const cleaned = text.replaceAll(',', '').replace(/(?:kg|cm|mm|m\/s|secs?|seconds?)$/i, '').trim();
  if (cleaned === '') return undefined;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : undefined;
}

export function optionalInteger(value: unknown): number | undefined {
  const number = optionalNumber(value);
  return number != null && Number.isInteger(number) ? number : undefined;
}

export function parseDate(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return parseGoogleDateSerial(value);
  }
  const text = optionalText(value);
  if (!text) return undefined;

  if (/^\d{5}(?:\.\d+)?$/.test(text)) return parseGoogleDateSerial(Number(text));

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) return formatDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dayFirst = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/.exec(text);
  if (dayFirst) {
    const yearValue = Number(dayFirst[3]);
    const year = yearValue < 100 ? 2000 + yearValue : yearValue;
    const first = Number(dayFirst[1]);
    const second = Number(dayFirst[2]);
    // Infer only when the date is unambiguous. Preserve the existing day-first
    // convention for ambiguous legacy text; API dates arrive as serial values.
    const month = second > 12 ? first : second;
    const day = second > 12 ? second : first;
    return formatDate(year, month, day);
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return formatDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

function parseGoogleDateSerial(value: number): string | undefined {
  const milliseconds = Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000;
  const serialDate = new Date(milliseconds);
  return formatDate(serialDate.getUTCFullYear(), serialDate.getUTCMonth() + 1, serialDate.getUTCDate());
}

function formatDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return undefined;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

export function parseExtra(value: unknown): Metadata | undefined {
  const text = optionalText(value);
  if (!text) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Metadata)
      : undefined;
  } catch {
    return undefined;
  }
}

export function normaliseHeader(value: unknown): string {
  return optionalText(value)?.toLowerCase().replace(/[^a-z0-9]+/g, '') ?? '';
}

export type RowRecord = Record<string, string | undefined>;

export function rowsToRecords(rows: string[][]): Array<{ rowNumber: number; record: RowRecord }> {
  const headers = (rows[0] ?? []).map(normaliseHeader);
  return rows.slice(1).map((row, rowIndex) => ({
    rowNumber: rowIndex + 2,
    record: Object.fromEntries(headers.map((header, index) => [header, optionalText(row[index])])),
  }));
}

export function pick(record: RowRecord, ...names: string[]): string | undefined {
  for (const name of names) {
    const result = record[normaliseHeader(name)];
    if (result != null) return result;
  }
  return undefined;
}
