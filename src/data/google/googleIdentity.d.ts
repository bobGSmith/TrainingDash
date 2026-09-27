interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
  error_callback?: (error: { type?: string; message?: string }) => void;
}

interface Window {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient(config: GoogleTokenClientConfig): GoogleTokenClient;
        revoke(token: string, callback?: () => void): void;
      };
    };
  };
}

