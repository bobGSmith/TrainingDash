import { useState } from 'react';
import type { PerformanceCurveData } from '../domain/performanceCurve';
import type { EstimatedOneRepMaxObservation, StrengthStatePoint } from '../domain/strength';

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

export function StrengthEstimateChart({ observations, state }: { observations: EstimatedOneRepMaxObservation[]; state: StrengthStatePoint[] }) {
  const [selectedRaw, setSelectedRaw] = useState<EstimatedOneRepMaxObservation>();
  const [selectedState, setSelectedState] = useState<StrengthStatePoint>();
  if (!observations.length) return <div className="empty-state">No qualifying 1–12 rep performances for e1RM modelling.</div>;
  const width = 760, height = 310, left = 48, right = 20, top = 28, bottom = 44;
  const days = observations.map((item) => Date.parse(`${item.date}T00:00:00Z`));
  const values = [...observations.map((item) => item.e1rmKg), ...state.map((item) => item.estimatedStrengthKg)];
  const minDay = Math.min(...days), maxDay = Math.max(...days), minValue = Math.min(...values), maxValue = Math.max(...values), valuePad = (maxValue - minValue || 1) * .1;
  const sx = (date: string) => left + ((Date.parse(`${date}T00:00:00Z`) - minDay) / (maxDay - minDay || 1)) * (width - left - right);
  const sy = (value: number) => height - bottom - ((value - (minValue - valuePad)) / (maxValue - minValue + valuePad * 2 || 1)) * (height - top - bottom);
  return <div><div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Raw estimated one repetition maximum observations and rolling estimated current strength over time">
    <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} className="axis" /><line x1={left} y1={top} x2={left} y2={height - bottom} className="axis" />
    {state.length > 1 && <polyline points={state.map((item) => `${sx(item.date)},${sy(item.estimatedStrengthKg)}`).join(' ')} className="strength-state-line" />}
    {observations.map((item) => <g key={item.id} className="raw-estimate-point" role="button" tabIndex={0} onClick={() => { setSelectedRaw(item); setSelectedState(undefined); }} onKeyDown={(event) => event.key === 'Enter' && setSelectedRaw(item)}><circle cx={sx(item.date)} cy={sy(item.e1rmKg)} r="5" /><title>{item.date}: {item.loadKg} kg × {item.reps} → {item.e1rmKg.toFixed(1)} kg e1RM</title></g>)}
    {state.map((item) => <g key={item.date} className="strength-state-point" role="button" tabIndex={0} onClick={() => { setSelectedState(item); setSelectedRaw(undefined); }} onKeyDown={(event) => event.key === 'Enter' && setSelectedState(item)}><circle cx={sx(item.date)} cy={sy(item.estimatedStrengthKg)} r="6" /><title>{item.date}: modelled current strength {item.estimatedStrengthKg.toFixed(1)} kg</title></g>)}
    <text x={left} y={18} className="chart-label">Estimated 1RM (kg)</text><text x={left} y={height - 10} className="chart-label">{new Date(minDay).toISOString().slice(0, 10)}</text><text x={width - right} y={height - 10} textAnchor="end" className="chart-label">{new Date(maxDay).toISOString().slice(0, 10)}</text>
  </svg></div><div className="legend"><span><i className="dot raw-estimate" />Raw set estimate</span><span><i className="dot strength-state" />Estimated current strength</span></div>
    {selectedRaw && <div className="point-detail"><strong>{selectedRaw.loadKg} kg × {selectedRaw.reps} → {selectedRaw.e1rmKg.toFixed(1)} kg e1RM</strong><span>{selectedRaw.date}{selectedRaw.rpe != null ? ` · RPE ${selectedRaw.rpe}` : ' · RPE unknown'}{selectedRaw.session ? ` · ${selectedRaw.session}` : ''}</span><p>{[selectedRaw.rawExtra, selectedRaw.symptoms, selectedRaw.notes].filter(Boolean).join(' · ') || 'No additional metadata recorded.'}</p></div>}
    {selectedState && <div className="point-detail"><strong>Estimated current strength: {selectedState.estimatedStrengthKg.toFixed(1)} kg</strong><span>{selectedState.date} · upper-performance estimate from {selectedState.contributingObservationIds.length} recent observation{selectedState.contributingObservationIds.length === 1 ? '' : 's'}</span><p>Uses the best recent qualifying performances from {selectedState.windowStart} through {selectedState.date}. This is modelled state, not a lift performed on this date.</p></div>}
  </div>;
}
