export const GASTI_DEVELOPMENT_MODEL = 'gemini-2.5-flash';
export const GASTI_PRODUCTION_MODEL = 'gemini-2.5-pro';
export const GASTI_DEFAULT_MODEL_FALLBACK_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash-lite',
] as const;

type GastiModelEnv = Partial<Pick<NodeJS.ProcessEnv, 'GASTI_AI_MODEL' | 'GASTI_AI_MODEL_FALLBACK_CHAIN'>>;
type GeminiApiKeyEnv = Partial<Record<'GEMINI_API_KEY', string | undefined>>;

export function getGastiModelFallbackChain(env: GastiModelEnv = process.env): string[] {
  const override = env.GASTI_AI_MODEL?.trim();

  if (override) {
    return [override];
  }

  const fallbackChain = env.GASTI_AI_MODEL_FALLBACK_CHAIN?.split(',').map((model) => model.trim()).filter(Boolean) ?? [];

  return fallbackChain.length > 0 ? fallbackChain : [...GASTI_DEFAULT_MODEL_FALLBACK_CHAIN];
}

export function getGastiModelId(env: GastiModelEnv = process.env): string {
  return getGastiModelFallbackChain(env)[0];
}

export function getGeminiApiKey(env: GeminiApiKeyEnv = process.env): string {
  return env.GEMINI_API_KEY?.trim() ?? '';
}
