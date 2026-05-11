export const GASTI_DEVELOPMENT_MODEL = 'gemini-2.5-flash';
export const GASTI_PRODUCTION_MODEL = 'gemini-2.5-pro';

type GastiModelEnv = Partial<Pick<NodeJS.ProcessEnv, 'GASTI_AI_MODEL' | 'NODE_ENV'>>;
type GeminiApiKeyEnv = Partial<Record<'GEMINI_API_KEY', string | undefined>>;

export function getGastiModelId(env: GastiModelEnv = process.env): string {
  const override = env.GASTI_AI_MODEL?.trim();

  if (override) {
    return override;
  }

  return env.NODE_ENV === 'production' ? GASTI_PRODUCTION_MODEL : GASTI_DEVELOPMENT_MODEL;
}

export function getGeminiApiKey(env: GeminiApiKeyEnv = process.env): string {
  return env.GEMINI_API_KEY?.trim() ?? '';
}
