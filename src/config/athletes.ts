export const SHEET_TABS = [
  'Full Session tracking',
  'Sprinting PBs',
  'Jumping PBs',
  'Lifting PBs',
  'Daily Status',
  'Program',
] as const;

export type SheetTab = (typeof SHEET_TABS)[number];

export const SHEET_TAB_ALIASES: Partial<Record<SheetTab, readonly string[]>> = {
  'Daily Status': ['Daily Metrics'],
};

export interface AthleteConfig {
  id: string;
  name: string;
  spreadsheetId: string;
  tabs: readonly SheetTab[];
  enabledModules: {
    sprint: boolean;
    jumps: boolean;
    strength: boolean;
    training: boolean;
    recovery: boolean;
  };
}

export const ATHLETES: readonly AthleteConfig[] = [
  {
    id: 'owner',
    name: 'Athleticism Testing',
    spreadsheetId: '1-RT8KGmUdYjU6jjuxKDmfbrA4cWBSeQH8biV6AUSgeM',
    tabs: SHEET_TABS,
    enabledModules: {
      sprint: true,
      jumps: true,
      strength: true,
      training: true,
      recovery: true,
    },
  },
] as const;

export const DEFAULT_ATHLETE: AthleteConfig = ATHLETES[0]!;
