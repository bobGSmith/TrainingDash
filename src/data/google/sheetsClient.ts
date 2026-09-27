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

export async function fetchWorkbook(
  athlete: AthleteConfig,
  accessToken: string,
  signal?: AbortSignal,
): Promise<RawWorkbook> {
  const query = new URLSearchParams();
  athlete.tabs.forEach((tab) => query.append('ranges', `'${tab.replaceAll("'", "''")}'`));
  query.set('majorDimension', 'ROWS');
  query.set('valueRenderOption', 'UNFORMATTED_VALUE');
  query.set('dateTimeRenderOption', 'FORMATTED_STRING');

  const response = await fetch(
    `${SHEETS_API}/${encodeURIComponent(athlete.spreadsheetId)}/values:batchGet?${query}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal },
  );

  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? '';
    } catch {
      // Preserve the HTTP status if Google did not return JSON.
    }
    throw new SheetsApiError(detail || `Google Sheets request failed (${response.status}).`, response.status);
  }

  const body = (await response.json()) as BatchGetResponse;
  const fetchedAt = new Date().toISOString();
  const workbook = {} as RawWorkbook;

  athlete.tabs.forEach((tab, index) => {
    const valueRange = body.valueRanges?.[index];
    const sheet: RawSheet = {
      tab,
      range: valueRange?.range ?? tab,
      majorDimension: 'ROWS',
      rows: asRawRows(valueRange?.values),
      fetchedAt,
    };
    workbook[tab as SheetTab] = sheet;
  });

  return workbook;
}
