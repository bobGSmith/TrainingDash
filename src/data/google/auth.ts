export const SHEETS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets.readonly';

const GIS_SCRIPT_ID = 'google-identity-services';
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

export function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');

    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Google Identity Services failed to load.')), {
      once: true,
    });

    if (!existing) {
      script.id = GIS_SCRIPT_ID;
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
  });
}

export async function requestGoogleAccessToken(clientId: string): Promise<string> {
  await loadGoogleIdentityServices();

  return new Promise((resolve, reject) => {
    const oauth2 = window.google?.accounts.oauth2;
    if (!oauth2) {
      reject(new Error('Google Identity Services is unavailable.'));
      return;
    }

    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SHEETS_READONLY_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description ?? response.error ?? 'Google sign-in failed.'));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (error) => reject(new Error(error.message ?? error.type ?? 'Google sign-in failed.')),
    });

    client.requestAccessToken();
  });
}

export function revokeGoogleAccessToken(accessToken: string): Promise<void> {
  return new Promise((resolve) => {
    const revoke = window.google?.accounts.oauth2.revoke;
    if (!revoke) {
      resolve();
      return;
    }
    revoke(accessToken, resolve);
  });
}
