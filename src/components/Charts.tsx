import { useState } from 'react';
import type { PerformanceCurveData } from '../domain/performanceCurve';

export interface ChartDatum {
  id: string;
  date?: string;
  value: number;
  label: string;
  detail?: string;
}

export function ProgressChart({ data, lowerIsBetter = false, unit }: { data: ChartDatum[]; lowerIsBetter?: boolean; unit: string }) {
  const [selected, setSelected] = useState<ChartDatum>();
  if (data.length === 0) return <div className="empty-state">No compatible measured performances.</div>;
  const width = 760, height = 270, pad = 34;
  const values = data.map((point) => point.value);
  const min = Math.min(...values), max = Math.max(...values), spread = max - min || 1;
  const points = data.map((point, index) => ({ ...point, x: pad + (index / Math.max(data.length - 1, 1)) * (width - pad * 2), y: pad + ((max - point.value) / spread) * (height - pad * 2) }));
  return <div>
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Performance progression in ${unit}`}>
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="axis" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} className="axis" />
        <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} className="trend-line" />
        {points.map((point) => <g key={point.id} onClick={() => setSelected(point)} className="chart-point" tabIndex={0} role="button" onKeyDown={(event) => event.key === 'Enter' && setSelected(point)}>
          <circle cx={point.x} cy={point.y} r="7" /><title>{point.label}</title>
        </g>)}
        <text x={pad} y={18} className="chart-label">{max.toFixed(3)} {unit}</text>
        <text x={pad} y={height - 8} className="chart-label">{min.toFixed(3)} {unit}</text>
      </svg>
    </div>
    <p className="muted">{lowerIsBetter ? 'Lower is better.' : 'Higher is better.'} Select a point for its observation.</p>
    {selected && <div className="point-detail"><strong>{selected.label}</strong><span>{selected.date ?? 'Date unknown'} · {selected.value} {unit}</span>{selected.detail && <p>{selected.detail}</p>}</div>}
  </div>;
}

export function PerformanceCurve({ curve }: { curve: PerformanceCurveData }) {
  const [selected, setSelected] = useState(curve.frontier[0]);
  const width = 760, height = 300, pad = 44;
  const all = curve.observations;
  const xs = all.map((p) => p.amount), ys = all.map((p) => p.intensity);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sx = (x: number) => pad + ((x - minX) / (maxX - minX || 1)) * (width - pad * 2);
  const sy = (y: number) => height - pad - ((y - minY) / (maxY - minY || 1)) * (height - pad * 2);
  return <div>
    <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${curve.exercise} performance curve`}>
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="axis" />
      <line x1={pad} y1={pad} x2={pad} y2={height - pad} className="axis" />
      {all.map((point, index) => <circle key={index} cx={sx(point.amount)} cy={sy(point.intensity)} r="5" className="history-point" />)}
      <polyline points={curve.frontier.map((point) => `${sx(point.amount)},${sy(point.intensity)}`).join(' ')} className="frontier-line" />
      {curve.frontier.map((point, index) => <g key={index} className="chart-point" onClick={() => setSelected(point)}><circle cx={sx(point.amount)} cy={sy(point.intensity)} r="8" /><title>{point.amount} {curve.amountUnit} × {point.intensity} {curve.intensityUnit}</title></g>)}
      <text x={width / 2} y={height - 7} className="chart-label axis-title">Amount ({curve.amountUnit})</text>
      <text x={6} y={18} className="chart-label">Intensity ({curve.intensityUnit})</text>
    </svg></div>
    <div className="legend"><span><i className="dot historical" />All observations</span><span><i className="dot frontier" />Demonstrated envelope</span></div>
    {selected && <div className="point-detail"><strong>{selected.amount} {selected.amountUnit} × {selected.intensity} {selected.intensityUnit}</strong><span>{selected.observation.date ?? 'Date unknown'}</span><p>{[selected.observation.rawExtra, selected.observation.symptoms, selected.observation.notes].filter(Boolean).join(' · ') || 'No additional context recorded.'}</p></div>}
  </div>;
}
