import { SHEET_TAB_ALIASES, type AthleteConfig, type SheetTab } from '../../config/athletes';
import type { RawSheet, RawWorkbook } from '../raw/types';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

interface ValueRangeResponse {
  range?: string;
  majorDimension?: 'ROWS' | 'COLUMNS';
  values?: unknown[][];
}

interface SpreadsheetMetadataResponse {
  sheets?: Array<{ properties?: { title?: string; gridProperties?: { rowCount?: number; columnCount?: number } } }>;
}

function columnName(columnCount: number): string {
  let value = Math.max(1, columnCount);
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export class SheetsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'SheetsApiError';
  }
}

function asRawRows(values: unknown[][] | undefined): string[][] {
  return (values ?? []).map((row) => row.map((cell) => (cell == null ? '' : String(cell))));
}

function comparableTitle(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function resolveTabTitles(
  requested: readonly SheetTab[],
  available: readonly string[],
): Map<SheetTab, string> {
  const resolved = new Map<SheetTab, string>();
  for (const tab of requested) {
    const exact = available.find((title) => title === tab);
    const acceptedTitles = [tab, ...(SHEET_TAB_ALIASES[tab] ?? [])];
    const tolerant = available.find((title) => acceptedTitles.some((candidate) => comparableTitle(title) === comparableTitle(candidate)));
    const title = exact ?? tolerant;
    if (title) resolved.set(tab, title);
  }
  return resolved;
}

async function responseError(response: Response): Promise<SheetsApiError> {
  let detail = '';
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    detail = body.error?.message ?? '';
  } catch {
    // Preserve the HTTP status if Google did not return JSON.
  }
  return new SheetsApiError(detail || `Google Sheets request failed (${response.status}).`, response.status);
}

export async function fetchWorkbook(
  athlete: AthleteConfig,
  accessToken: string,
  signal?: AbortSignal,
): Promise<RawWorkbook> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const metadataQuery = new URLSearchParams({ fields: 'sheets.properties(title,gridProperties(rowCount,columnCount))' });
  const metadataResponse = await fetch(
    `${SHEETS_API}/${encodeURIComponent(athlete.spreadsheetId)}?${metadataQuery}`,
    { headers, signal },
  );
  if (!metadataResponse.ok) throw await responseError(metadataResponse);

  const metadata = (await metadataResponse.json()) as SpreadsheetMetadataResponse;
  const availableSheets = (metadata.sheets ?? [])
    .flatMap((sheet) => sheet.properties?.title ? [{
      title: sheet.properties.title,
      rowCount: sheet.properties.gridProperties?.rowCount ?? 1000,
      columnCount: sheet.properties.gridProperties?.columnCount ?? 26,
    }] : []);
  const availableTitles = availableSheets
    .map((sheet) => sheet.title);
  const resolvedTitles = resolveTabTitles(athlete.tabs, availableTitles);
  const resolvedTabs = athlete.tabs.flatMap((tab) => {
    const sourceTitle = resolvedTitles.get(tab);
    const grid = availableSheets.find((sheet) => sheet.title === sourceTitle);
    return sourceTitle && grid ? [{ tab, sourceTitle, ...grid }] : [];
  });

  const fetchedRanges = new Map<SheetTab, ValueRangeResponse>();
  await Promise.all(resolvedTabs.map(async ({ tab, sourceTitle, rowCount, columnCount }) => {
    const escapedTitle = sourceTitle.replaceAll("'", "''");
    const a1Range = `'${escapedTitle}'!A1:${columnName(columnCount)}${rowCount}`;
    const query = new URLSearchParams({
      majorDimension: 'ROWS',
      valueRenderOption: 'UNFORMATTED_VALUE',
      // Serial dates are locale-independent; the normaliser converts them to ISO dates.
      dateTimeRenderOption: 'SERIAL_NUMBER',
    });
    const response = await fetch(
      `${SHEETS_API}/${encodeURIComponent(athlete.spreadsheetId)}/values/${encodeURIComponent(a1Range)}?${query}`,
      { headers, signal },
    );
    if (!response.ok) throw await responseError(response);
    fetchedRanges.set(tab, (await response.json()) as ValueRangeResponse);
  }));
  const fetchedAt = new Date().toISOString();
  const workbook = {} as RawWorkbook;

  athlete.tabs.forEach((tab) => {
    const sourceTitle = resolvedTitles.get(tab);
    const valueRange = fetchedRanges.get(tab);
    const missingMessage = sourceTitle ? undefined : `Tab not found. Available tabs: ${availableTitles.join(', ') || 'none'}.`;
    const sheet: RawSheet = {
      tab,
      sourceTitle,
      range: valueRange?.range ?? tab,
      majorDimension: 'ROWS',
      rows: asRawRows(valueRange?.values),
      fetchedAt,
      error: missingMessage,
    };
    workbook[tab as SheetTab] = sheet;
  });

  return workbook;
}
