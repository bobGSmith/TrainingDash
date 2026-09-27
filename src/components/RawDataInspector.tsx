import { useState } from 'react';
import type { SheetTab } from '../config/athletes';
import { SHEET_TABS } from '../config/athletes';
import type { RawWorkbook } from '../data/raw/types';

const PREVIEW_ROWS = 50;

export function RawDataInspector({ workbook }: { workbook: RawWorkbook }) {
  const [tab, setTab] = useState<SheetTab>('Data');
  const sheet = workbook[tab];
  const headers = sheet.rows[0] ?? [];
  const dataRows = sheet.rows.slice(1, PREVIEW_ROWS + 1);

  return (
    <section className="panel inspector">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Verification</p>
          <h2>Raw data inspector</h2>
        </div>
        <label className="select-label">
          <span>Sheet tab</span>
          <select value={tab} onChange={(event) => setTab(event.target.value as SheetTab)}>
            {SHEET_TABS.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
      </div>
      <p className="muted">
        Showing {Math.min(dataRows.length, PREVIEW_ROWS)} of {Math.max(sheet.rows.length - 1, 0)} data rows.
        Values below are unmodified API results.
      </p>
      {sheet.rows.length === 0 ? (
        <div className="empty-state">This tab returned no values.</div>
      ) : (
        <div className="table-scroll" tabIndex={0}>
          <table>
            <thead><tr><th>#</th>{headers.map((header, index) => <th key={index}>{header || `Column ${index + 1}`}</th>)}</tr></thead>
            <tbody>
              {dataRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <td>{rowIndex + 2}</td>
                  {headers.map((_, cellIndex) => <td key={cellIndex}>{row[cellIndex] ?? ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

