const EXERCISE_ALIASES: Readonly<Record<string, string>> = {
  backsquat: 'Back squat',
  'back squat': 'Back squat',
  bss: 'Bulgarian split squat',
  'bulgarian split squat': 'Bulgarian split squat',
};

export function normaliseExerciseName(sourceName: string): string {
  const trimmed = sourceName.trim().replace(/\s+/g, ' ');
  return EXERCISE_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

