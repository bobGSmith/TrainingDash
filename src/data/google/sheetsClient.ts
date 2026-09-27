import type { AthleteConfig, SheetTab } from '../../config/athletes';
import type { RawSheet, RawWorkbook } from '../raw/types';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

interface BatchGetResponse {
  valueRanges?: Array<{
    range?: string;
    majorDimension?: 'ROWS' | 'COLUMNS';
    values?: unknown[][];
  }>;
}

interface SpreadsheetMetadataResponse {
  sheets?: Array<{ properties?: { title?: string } }>;
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
    const tolerant = available.find((title) => comparableTitle(title) === comparableTitle(tab));
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
  const metadataQuery = new URLSearchParams({ fields: 'sheets.properties.title' });
  const metadataResponse = await fetch(
    `${SHEETS_API}/${encodeURIComponent(athlete.spreadsheetId)}?${metadataQuery}`,
    { headers, signal },
  );
  if (!metadataResponse.ok) throw await responseError(metadataResponse);

  const metadata = (await metadataResponse.json()) as SpreadsheetMetadataResponse;
  const availableTitles = (metadata.sheets ?? [])
    .map((sheet) => sheet.properties?.title)
    .filter((title): title is string => Boolean(title));
  const resolvedTitles = resolveTabTitles(athlete.tabs, availableTitles);
  const resolvedTabs = athlete.tabs.flatMap((tab) => {
    const sourceTitle = resolvedTitles.get(tab);
    return sourceTitle ? [{ tab, sourceTitle }] : [];
  });

  const query = new URLSearchParams();
  resolvedTabs.forEach(({ sourceTitle }) => query.append('ranges', `'${sourceTitle.replaceAll("'", "''")}'`));
  query.set('majorDimension', 'ROWS');
  query.set('valueRenderOption', 'UNFORMATTED_VALUE');
  query.set('dateTimeRenderOption', 'FORMATTED_STRING');

  let body: BatchGetResponse = {};
  if (resolvedTabs.length > 0) {
    const response = await fetch(
      `${SHEETS_API}/${encodeURIComponent(athlete.spreadsheetId)}/values:batchGet?${query}`,
      { headers, signal },
    );
    if (!response.ok) throw await responseError(response);
    body = (await response.json()) as BatchGetResponse;
  }
  const fetchedAt = new Date().toISOString();
  const workbook = {} as RawWorkbook;

  athlete.tabs.forEach((tab) => {
    const resolvedIndex = resolvedTabs.findIndex((entry) => entry.tab === tab);
    const sourceTitle = resolvedTitles.get(tab);
    const valueRange = resolvedIndex >= 0 ? body.valueRanges?.[resolvedIndex] : undefined;
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
