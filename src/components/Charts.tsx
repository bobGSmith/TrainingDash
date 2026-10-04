import { useState } from 'react';
import type { PerformanceCurveData } from '../domain/performanceCurve';
import type { EstimatedOneRepMaxObservation, StrengthStatePoint } from '../domain/strength';
import type { AccelerationEnvelopePoint, SprintSessionSummary, SprintSpeedMetric } from '../domain/sprintAnalysis';
import { formatSprintConditions } from '../domain/sprintPresentation';

export interface ChartDatum {
  id: string;
  date?: string;
  value: number;
  label: string;
  detail?: string;
}

export function ProgressChart({ data, lowerIsBetter = false, unit, labelPoints = false, yAxisLabel = 'Performance' }: { data: ChartDatum[]; lowerIsBetter?: boolean; unit: string; labelPoints?: boolean; yAxisLabel?: string }) {
  const [selected, setSelected] = useState<ChartDatum>();
  if (data.length === 0) return <div className="empty-state">No compatible measured performances.</div>;
  const width = 760, height = 300, left = 58, right = 24, top = 30, bottom = 56;
  const values = data.map((point) => point.value);
  const min = Math.min(...values), max = Math.max(...values), spread = max - min || 1, valuePad = spread * .1;
  const dated = data.every((point) => point.date && Number.isFinite(Date.parse(`${point.date}T00:00:00Z`)));
  const days = dated ? data.map((point) => Date.parse(`${point.date}T00:00:00Z`)) : data.map((_, index) => index);
  const minDay = Math.min(...days), maxDay = Math.max(...days);
  const sx = (day: number) => left + (day - minDay) / (maxDay - minDay || 1) * (width - left - right);
  const sy = (value: number) => height - bottom - (value - (min - valuePad)) / (spread + valuePad * 2) * (height - top - bottom);
  const points = data.map((point, index) => ({ ...point, x: sx(days[index]!), y: sy(point.value) }));
  const yTicks = Array.from({ length: 5 }, (_, index) => min - valuePad + (spread + valuePad * 2) * index / 4);
  const xTicks = [...new Set([minDay, minDay + (maxDay - minDay) / 2, maxDay])];
  const dateLabel = (value: number) => dated ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' }) : String(Math.round(value + 1));
  return <div>
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Performance progression in ${unit}`}>
        {yTicks.map((tick) => <g key={tick}><line x1={left} y1={sy(tick)} x2={width - right} y2={sy(tick)} className="chart-grid" /><text x={left - 8} y={sy(tick) + 4} textAnchor="end" className="chart-label">{tick.toFixed(spread < 10 ? 1 : 0)}</text></g>)}
        {xTicks.map((tick) => <text key={tick} x={sx(tick)} y={height - bottom + 21} textAnchor={tick === minDay ? 'start' : tick === maxDay ? 'end' : 'middle'} className="chart-label">{dateLabel(tick)}</text>)}
        <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} className="axis" />
        <line x1={left} y1={top} x2={left} y2={height - bottom} className="axis" />
        <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} className="trend-line" />
        {points.map((point) => <g key={point.id} onClick={() => setSelected(point)} className="chart-point" tabIndex={0} role="button" onKeyDown={(event) => event.key === 'Enter' && setSelected(point)}>
          <circle cx={point.x} cy={point.y} r="7" /><title>{point.label}</title>{labelPoints && points.length <= 14 && <text x={point.x} y={point.y - 12} textAnchor="middle" className="chart-value-label">{point.value.toFixed(1)}</text>}
        </g>)}
        <text x={14} y={(top + height - bottom) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(top + height - bottom) / 2})`} className="chart-label axis-title">{yAxisLabel} ({unit})</text>
        <text x={(left + width - right) / 2} y={height - 7} className="chart-label axis-title">{dated ? 'Date' : 'Observation'}</text>
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
  const xTicks = Array.from({ length: 5 }, (_, index) => minX + (maxX - minX) * index / 4);
  const yTicks = Array.from({ length: 5 }, (_, index) => minY + (maxY - minY) * index / 4);
  return <div>
    <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${curve.exercise} performance curve`}>
      {yTicks.map((tick) => <g key={`y-${tick}`}><line x1={pad} y1={sy(tick)} x2={width - pad} y2={sy(tick)} className="chart-grid" /><text x={pad - 8} y={sy(tick) + 4} textAnchor="end" className="chart-label">{tick.toFixed(1)}</text></g>)}
      {xTicks.map((tick) => <text key={`x-${tick}`} x={sx(tick)} y={height - pad + 18} textAnchor={tick === minX ? 'start' : tick === maxX ? 'end' : 'middle'} className="chart-label">{tick.toFixed(tick % 1 ? 1 : 0)}</text>)}
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="axis" />
      <line x1={pad} y1={pad} x2={pad} y2={height - pad} className="axis" />
      {all.map((point, index) => <circle key={index} cx={sx(point.amount)} cy={sy(point.intensity)} r="5" className="history-point" />)}
      <polyline points={curve.frontier.map((point) => `${sx(point.amount)},${sy(point.intensity)}`).join(' ')} className="frontier-line" />
      {curve.frontier.map((point, index) => <g key={index} className="chart-point" onClick={() => setSelected(point)}><circle cx={sx(point.amount)} cy={sy(point.intensity)} r="8" /><text x={sx(point.amount)} y={sy(point.intensity) - 13} textAnchor="middle" className="chart-value-label">{point.intensity} kg</text><title>{point.amount} {curve.amountUnit} × {point.intensity} {curve.intensityUnit}</title></g>)}
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
  const yTicks = Array.from({ length: 5 }, (_, index) => minValue - valuePad + (maxValue - minValue + valuePad * 2) * index / 4);
  const xTicks = [...new Set([minDay, minDay + (maxDay - minDay) / 2, maxDay])];
  const dateLabel = (value: number) => new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' });
  return <div><div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Raw estimated one repetition maximum observations and rolling estimated current strength over time">
    {yTicks.map((tick) => <g key={tick}><line x1={left} y1={sy(tick)} x2={width - right} y2={sy(tick)} className="chart-grid" /><text x={left - 8} y={sy(tick) + 4} textAnchor="end" className="chart-label">{tick.toFixed(0)}</text></g>)}
    {xTicks.map((tick) => <text key={tick} x={left + (tick - minDay) / (maxDay - minDay || 1) * (width - left - right)} y={height - bottom + 21} textAnchor={tick === minDay ? 'start' : tick === maxDay ? 'end' : 'middle'} className="chart-label">{dateLabel(tick)}</text>)}
    <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} className="axis" /><line x1={left} y1={top} x2={left} y2={height - bottom} className="axis" />
    {state.length > 1 && <polyline points={state.map((item) => `${sx(item.date)},${sy(item.estimatedStrengthKg)}`).join(' ')} className="strength-state-line" />}
    {observations.map((item) => <g key={item.id} className="raw-estimate-point" role="button" tabIndex={0} onClick={() => { setSelectedRaw(item); setSelectedState(undefined); }} onKeyDown={(event) => event.key === 'Enter' && setSelectedRaw(item)}><circle cx={sx(item.date)} cy={sy(item.e1rmKg)} r="5" />{observations.length <= 12 && <text x={sx(item.date)} y={sy(item.e1rmKg) - 9} textAnchor="middle" className="chart-value-label subdued">{item.e1rmKg.toFixed(0)}</text>}<title>{item.date}: {item.loadKg} kg × {item.reps} → {item.e1rmKg.toFixed(1)} kg e1RM</title></g>)}
    {state.map((item) => <g key={item.date} className="strength-state-point" role="button" tabIndex={0} onClick={() => { setSelectedState(item); setSelectedRaw(undefined); }} onKeyDown={(event) => event.key === 'Enter' && setSelectedState(item)}><circle cx={sx(item.date)} cy={sy(item.estimatedStrengthKg)} r="6" /><title>{item.date}: modelled current strength {item.estimatedStrengthKg.toFixed(1)} kg</title></g>)}
    <text x={14} y={(top + height - bottom) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(top + height - bottom) / 2})`} className="chart-label axis-title">Estimated 1RM (kg)</text><text x={(left + width - right) / 2} y={height - 7} className="chart-label axis-title">Date</text>
  </svg></div><div className="legend"><span><i className="dot raw-estimate" />Raw set estimate</span><span><i className="dot strength-state" />Estimated current strength</span></div>
    {selectedRaw && <div className="point-detail"><strong>{selectedRaw.loadKg} kg × {selectedRaw.reps} → {selectedRaw.e1rmKg.toFixed(1)} kg e1RM</strong><span>{selectedRaw.date}{selectedRaw.rpe != null ? ` · RPE ${selectedRaw.rpe}` : ' · RPE unknown'}{selectedRaw.session ? ` · ${selectedRaw.session}` : ''}</span><p>{[selectedRaw.rawExtra, selectedRaw.symptoms, selectedRaw.notes].filter(Boolean).join(' · ') || 'No additional metadata recorded.'}</p></div>}
    {selectedState && <div className="point-detail"><strong>Estimated current strength: {selectedState.estimatedStrengthKg.toFixed(1)} kg</strong><span>{selectedState.date} · upper-performance estimate from {selectedState.contributingObservationIds.length} recent observation{selectedState.contributingObservationIds.length === 1 ? '' : 's'}</span><p>Uses the best recent qualifying performances from {selectedState.windowStart} through {selectedState.date}. This is modelled state, not a lift performed on this date.</p></div>}
  </div>;
}

export function SprintProgressChart({ metrics, sessionSummaries = [], mode, showPbProgression = true }: { metrics: SprintSpeedMetric[]; sessionSummaries?: SprintSessionSummary[]; mode: 'time' | 'speed'; showPbProgression?: boolean }) {
  const [selected, setSelected] = useState<SprintSpeedMetric>();
  if (!metrics.length) return <div className="empty-state">No compatible timed performances.</div>;
  const sorted = [...metrics].filter((item) => item.observation.date).sort((a, b) => (a.observation.date ?? '').localeCompare(b.observation.date ?? '') || a.observation.rowNumber - b.observation.rowNumber);
  const value = (item: SprintSpeedMetric) => mode === 'time' ? item.observation.timeSeconds : item.averageSpeedMS;
  let best: number | undefined;
  const pb = showPbProgression ? sorted.filter((item) => { const current = value(item), improves = best == null || (mode === 'time' ? current < best : current > best); if (improves) best = current; return improves; }) : [];
  const width = 760, height = 310, left = 64, right = 22, top = 28, bottom = 58;
  const summaryValue = (item: SprintSessionSummary) => mode === 'time' ? item.meanTimeSeconds : item.meanSpeedMS;
  const summaryFastest = (item: SprintSessionSummary) => mode === 'time' ? item.fastestTimeSeconds : item.fastestSpeedMS;
  const summarySd = (item: SprintSessionSummary) => mode === 'time' ? item.timeStandardDeviation : item.speedStandardDeviation;
  const dates = sorted.map((item) => Date.parse(`${item.observation.date}T00:00:00Z`));
  const summaryValues = sessionSummaries.flatMap((item) => { const sd = summarySd(item); return sd == null ? [summaryValue(item), summaryFastest(item)] : [summaryValue(item) - sd, summaryValue(item) + sd, summaryFastest(item)]; });
  const values = [...sorted.map(value), ...summaryValues], minDate = Math.min(...dates), maxDate = Math.max(...dates), min = Math.min(...values), max = Math.max(...values), pad = (max - min || 1) * .1;
  const sx = (date: string) => left + ((Date.parse(`${date}T00:00:00Z`) - minDate) / (maxDate - minDate || 1)) * (width - left - right);
  const sy = (metric: number) => height - bottom - ((metric - (min - pad)) / (max - min + pad * 2 || 1)) * (height - top - bottom);
  const unit = mode === 'time' ? 's' : 'm/s';
  const lowerBound = min - pad, upperBound = max + pad;
  const yTicks = Array.from({ length: 5 }, (_, index) => lowerBound + (upperBound - lowerBound) * index / 4);
  const xTicks = [...new Set([minDate, minDate + (maxDate - minDate) / 2, maxDate])];
  const dateLabel = (date: number) => new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' });
  return <div><div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Sprint performance over time in ${unit}`}>
    {yTicks.map((tick) => <g key={tick}><line x1={left} y1={sy(tick)} x2={width - right} y2={sy(tick)} className="chart-grid" /><text x={left - 9} y={sy(tick) + 4} textAnchor="end" className="chart-label">{tick.toFixed(mode === 'time' ? 3 : 2)}</text></g>)}
    {xTicks.map((tick) => <g key={tick}><line x1={sx(new Date(tick).toISOString().slice(0, 10))} y1={height - bottom} x2={sx(new Date(tick).toISOString().slice(0, 10))} y2={height - bottom + 5} className="axis" /><text x={sx(new Date(tick).toISOString().slice(0, 10))} y={height - bottom + 20} textAnchor={tick === minDate ? 'start' : tick === maxDate ? 'end' : 'middle'} className="chart-label">{dateLabel(tick)}</text></g>)}
    <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} className="axis" /><line x1={left} y1={top} x2={left} y2={height - bottom} className="axis" />
    {sessionSummaries.length > 1 && <polygon points={[...sessionSummaries.map((item) => `${sx(item.date)},${sy(summaryValue(item) + (summarySd(item) ?? 0))}`), ...[...sessionSummaries].reverse().map((item) => `${sx(item.date)},${sy(summaryValue(item) - (summarySd(item) ?? 0))}`)].join(' ')} className="session-variability-band" />}
    {sessionSummaries.length > 1 && <polyline points={sessionSummaries.map((item) => `${sx(item.date)},${sy(summaryValue(item))}`).join(' ')} className="session-average-line" />}
    {sessionSummaries.length > 1 && <polyline points={sessionSummaries.map((item) => `${sx(item.date)},${sy(summaryFastest(item))}`).join(' ')} className="session-fastest-line" />}
    {sessionSummaries.map((item) => <g key={`summary-${item.id}`}>
      {summarySd(item) != null && <line x1={sx(item.date)} y1={sy(summaryValue(item) + summarySd(item)!)} x2={sx(item.date)} y2={sy(summaryValue(item) - summarySd(item)!)} className="session-sd-whisker" />}
      <circle cx={sx(item.date)} cy={sy(summaryValue(item))} r="4" className="session-average-point"><title>{item.date}: session mean {summaryValue(item).toFixed(3)} {unit}, n={item.observations.length}{summarySd(item) == null ? '' : `, SD ${summarySd(item)!.toFixed(3)}`}</title></circle>
      <circle cx={sx(item.date)} cy={sy(summaryFastest(item))} r="4" className="session-fastest-point"><title>{item.date}: session fastest {summaryFastest(item).toFixed(3)} {unit}</title></circle>
    </g>)}
    {pb.length > 1 && <polyline points={pb.map((item) => `${sx(item.observation.date!)},${sy(value(item))}`).join(' ')} className="frontier-line" />}
    {sorted.map((item) => <g key={`${item.observation.tab}:${item.observation.rowNumber}:${mode}`} className="raw-sprint-point" onClick={() => setSelected(item)} onKeyDown={(event) => event.key === 'Enter' && setSelected(item)} role="button" tabIndex={0}><circle cx={sx(item.observation.date!)} cy={sy(value(item))} r="6" /><title>{item.observation.date}: {value(item).toFixed(3)} {unit}</title></g>)}
    <text x={14} y={(top + height - bottom) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(top + height - bottom) / 2})`} className="chart-label axis-title">{mode === 'time' ? 'Time (seconds)' : 'Average speed (m/s)'}</text>
    <text x={(left + width - right) / 2} y={height - 7} className="chart-label axis-title">Date</text>
  </svg></div><div className="legend"><span><i className="dot raw-sprint" />Recorded rep</span>{sessionSummaries.length > 0 && <><span><i className="dot session-fastest" />Session fastest</span><span><i className="dot session-average" />Session average</span><span><i className="band-key" />±1 SD</span></>}{showPbProgression && <span><i className="dot frontier" />PB progression</span>}</div><p className="muted">{mode === 'time' ? 'Lower is better.' : 'Higher is better.'}</p>{selected && <div className="point-detail"><strong>{selected.observation.timeSeconds.toFixed(3)} s · {selected.averageSpeedMS.toFixed(2)} m/s · {selected.averageSpeedKMH.toFixed(1)} km/h</strong><span>{[selected.observation.date, formatSprintConditions(selected.observation)].filter(Boolean).join(' · ')}</span><p>{[selected.observation.symptoms && `Symptoms: ${selected.observation.symptoms}`, selected.observation.notes && `Notes: ${selected.observation.notes}`].filter(Boolean).join(' · ') || 'No additional notes.'}</p></div>}</div>;
}

export function AccelerationEnvelopeChart({ points }: { points: AccelerationEnvelopePoint[] }) {
  const [selected, setSelected] = useState<AccelerationEnvelopePoint>();
  if (!points.length) return <div className="empty-state">No compatible acceleration/start performances.</div>;
  const width = 760, height = 270, pad = 44, maxX = Math.max(...points.map((item) => item.distanceMetres)), maxY = Math.max(...points.map((item) => item.timeSeconds));
  const sx = (value: number) => pad + value / maxX * (width - pad * 2), sy = (value: number) => height - pad - value / maxY * (height - pad * 2);
  return <div><div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Best compatible acceleration performance envelope"><line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="axis" /><line x1={pad} y1={pad} x2={pad} y2={height - pad} className="axis" />{points.length > 1 && <polyline points={points.map((item) => `${sx(item.distanceMetres)},${sy(item.timeSeconds)}`).join(' ')} className="acceleration-envelope-line" />}{points.map((item) => <g key={item.distanceMetres} className="chart-point" onClick={() => setSelected(item)}><circle cx={sx(item.distanceMetres)} cy={sy(item.timeSeconds)} r="7" /><title>{item.distanceMetres.toFixed(1)} m: {item.timeSeconds.toFixed(3)} s</title></g>)}<text x={width / 2} y={height - 7} className="chart-label axis-title">Distance (m)</text><text x={7} y={18} className="chart-label">Best time (s)</text></svg></div><p className="muted">Best performance envelope from independently recorded compatible starts—not splits from one sprint.</p>{selected && <div className="point-detail"><strong>{selected.distanceMetres.toFixed(1)} m · {selected.timeSeconds.toFixed(3)} s</strong><span>{selected.averageSpeedMS.toFixed(2)} m/s average · {selected.observation.date ?? 'Date unknown'}</span></div>}</div>;
}
