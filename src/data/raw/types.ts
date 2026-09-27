import type { SheetTab } from '../../config/athletes';

export type RawCell = string;
export type RawRow = RawCell[];

export interface RawSheet {
  tab: SheetTab;
  range: string;
  majorDimension: 'ROWS';
  rows: RawRow[];
  fetchedAt: string;
}

export type RawWorkbook = Record<SheetTab, RawSheet>;

