import path from 'node:path';

export type IntegrationMode = 'offline' | 'degraded';

export interface IntegrationCredentials {
  ai?: {
    apiKey: string;
    baseUrl: string;
    visionModel: string;
    textModel: string;
  };
  nosana?: {
    endpoint: string;
    apiKey: string | null;
  };
  daytona?: {
    apiKey: string;
    apiUrl: string;
    target: string;
    snapshot: string;
    previewPort: number;
    autoStopMinutes: number;
  };
}

export interface OrchestratorConfig {
  host: string;
  port: number;
  dataDir: string;
  webOrigin?: string;
  credentials?: IntegrationCredentials;
  integrations: {
    ai: {
      mode: IntegrationMode;
      configured: boolean;
      detail: string;
    };
    nosana: {
      mode: IntegrationMode;
      configured: boolean;
      detail: string;
    };
    daytona: {
      mode: IntegrationMode;
      configured: boolean;
      detail: string;
    };
  };
}

function readPort(value: string | undefined): number {
  const parsed = Number(value ?? 8787);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65_536 ? parsed : 8787;
}

function readNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OrchestratorConfig {
  const aiConfigured = Boolean(env['OPENAI_API_KEY']);
  const nosanaConfigured = Boolean(env['NOSANA_ENDPOINT']);
  const daytonaConfigured = Boolean(env['DAYTONA_API_KEY'] && env['DAYTONA_SNAPSHOT']);

  return {
    host: env['HOST'] ?? '127.0.0.1',
    port: readPort(env['PORT']),
    dataDir: path.resolve(env['DATA_DIR'] ?? '.canvascraft'),
    webOrigin: env['WEB_ORIGIN'] ?? 'http://localhost:5173',
    credentials: {
      ...(aiConfigured
        ? {
            ai: {
              apiKey: env['OPENAI_API_KEY']!,
              baseUrl: env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1',
              visionModel: env['OPENAI_VISION_MODEL'] ?? 'gpt-5.6',
              textModel: env['OPENAI_TEXT_MODEL'] ?? 'gpt-5.6-luna',
            },
          }
        : {}),
      ...(nosanaConfigured
        ? {
            nosana: {
              endpoint: env['NOSANA_ENDPOINT']!.replace(/\/$/, ''),
              apiKey: env['NOSANA_API_KEY'] ?? null,
            },
          }
        : {}),
      ...(daytonaConfigured
        ? {
            daytona: {
              apiKey: env['DAYTONA_API_KEY']!,
              apiUrl: env['DAYTONA_API_URL'] ?? 'https://app.daytona.io/api',
              target: env['DAYTONA_TARGET'] ?? 'us',
              snapshot: env['DAYTONA_SNAPSHOT']!,
              previewPort: readPort(env['DAYTONA_PREVIEW_PORT'] ?? '4173'),
              autoStopMinutes: readNonNegativeInteger(env['DAYTONA_AUTO_STOP_MINUTES'], 30),
            },
          }
        : {}),
    },
    integrations: {
      ai: {
        mode: aiConfigured ? 'degraded' : 'offline',
        configured: aiConfigured,
        detail: aiConfigured
          ? 'AI credentials are configured. The run uses strict structured output and falls back to the deterministic compiler on failure.'
          : 'No AI credentials are loaded; the deterministic local compiler is active.',
      },
      nosana: {
        mode: nosanaConfigured ? 'degraded' : 'offline',
        configured: nosanaConfigured,
        detail: nosanaConfigured
          ? 'A Nosana endpoint is configured. Failed visual matching falls back to reviewed local registry metadata.'
          : 'No Nosana endpoint is loaded; matching uses reviewed local registry metadata.',
      },
      daytona: {
        mode: daytonaConfigured ? 'degraded' : 'offline',
        configured: daytonaConfigured,
        detail: daytonaConfigured
          ? 'Daytona credentials and a snapshot are configured. Failed branch launches remain visible as failed branches.'
          : 'No Daytona credentials or snapshot are loaded; manifests are persisted without live sandboxes.',
      },
    },
  };
}
