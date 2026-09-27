import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AthleteConfig } from '../config/athletes';
import { requestGoogleAccessToken, revokeGoogleAccessToken } from '../data/google/auth';
import { fetchWorkbook } from '../data/google/sheetsClient';
import { normalizeWorkbook } from '../data/normalized/normalize';
import type { RawWorkbook } from '../data/raw/types';

export type ConnectionStatus = 'idle' | 'loading' | 'connected' | 'error';

export function useDashboardData(athlete: AthleteConfig, clientId: string | undefined) {
  const [accessToken, setAccessToken] = useState<string>();
  const [rawWorkbook, setRawWorkbook] = useState<RawWorkbook>();
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string>();
  const abortRef = useRef<AbortController | undefined>(undefined);

  const load = useCallback(async (token: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');
    setError(undefined);
    try {
      const workbook = await fetchWorkbook(athlete, token, controller.signal);
      setRawWorkbook(workbook);
      setStatus('connected');
    } catch (cause) {
      if (controller.signal.aborted) return;
      setStatus('error');
      setError(cause instanceof Error ? cause.message : 'Unable to load spreadsheet data.');
    }
  }, [athlete]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const signIn = useCallback(async () => {
    if (!clientId) {
      setError('VITE_GOOGLE_CLIENT_ID is not configured.');
      return;
    }
    setError(undefined);
    try {
      const token = await requestGoogleAccessToken(clientId);
      setAccessToken(token);
      await load(token);
    } catch (cause) {
      setStatus('error');
      setError(cause instanceof Error ? cause.message : 'Google sign-in failed.');
    }
  }, [clientId, load]);

  const signOut = useCallback(async () => {
    abortRef.current?.abort();
    if (accessToken) await revokeGoogleAccessToken(accessToken);
    setAccessToken(undefined);
    setRawWorkbook(undefined);
    setStatus('idle');
    setError(undefined);
  }, [accessToken]);

  const normalized = useMemo(
    () => rawWorkbook ? normalizeWorkbook(rawWorkbook) : undefined,
    [rawWorkbook],
  );

  return {
    authenticated: Boolean(accessToken),
    rawWorkbook,
    normalized,
    status,
    error,
    clientConfigured: Boolean(clientId),
    signIn,
    signOut,
    reload: () => accessToken ? load(accessToken) : Promise.resolve(),
  };
}
