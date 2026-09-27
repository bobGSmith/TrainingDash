export type Metadata = Record<string, unknown>;

export interface SourceReference {
  tab: string;
  rowNumber: number;
}

export interface PerformanceContext {
  surface?: string;
  footwear?: string;
  protocol?: string;
  startType?: string;
  leadInMetres?: number;
  timingMethod?: string;
}

export interface SprintPerformance extends SourceReference, PerformanceContext {
  kind: 'sprint';
  date?: string;
  test: string;
  distanceMetres?: number;
  timeSeconds: number;
  effortPercent?: number;
  sets?: number;
  symptoms?: string;
  notes?: string;
  extra?: Metadata;
}

export interface JumpPerformance extends SourceReference, PerformanceContext {
  kind: 'jump';
  date?: string;
  test: string;
  result: number;
  unit?: string;
  sets?: number;
  symptoms?: string;
  notes?: string;
  extra?: Metadata;
}

export interface StrengthPerformance extends SourceReference {
  kind: 'strength';
  date?: string;
  exercise: string;
  sourceExercise: string;
  loadKg: number;
  reps: number;
  rpe?: number;
  velocityMps?: number;
  pain?: number;
  notes?: string;
  extra?: Metadata;
}

export interface TrainingSession extends SourceReference {
  kind: 'training';
  date?: string;
  session?: string;
  category?: string;
  exercise?: string;
  sets?: number;
  setsText?: string;
  amount?: number;
  amountUnit?: string;
  intensity?: number;
  intensityUnit?: string;
  surface?: string;
  footwear?: string;
  extra?: Metadata;
  rawExtra?: string;
  symptoms?: string;
  notes?: string;
  timingStart?: string;
  leadInMetres?: number;
  stance?: string;
  effortPercent?: number;
}

export interface DailyStatusObservation extends SourceReference {
  kind: 'daily-status';
  date?: string;
  timepoint?: string;
  context?: string;
  extra?: Metadata;
  rawExtra?: string;
  notes?: string;
}

export interface NormalizedWorkbook {
  sprints: SprintPerformance[];
  jumps: JumpPerformance[];
  strength: StrengthPerformance[];
  training: TrainingSession[];
  dailyStatus: DailyStatusObservation[];
}
