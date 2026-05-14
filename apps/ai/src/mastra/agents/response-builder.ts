import { z } from 'zod';

export const gastiResponseKindSchema = z.enum([
  'short_answer',
  'financial_insight',
  'comparison',
  'breakdown',
  'greeting',
  'clarification',
]);

export const gastiStructuredResponseSchema = z.object({
  kind: gastiResponseKindSchema,
  headline: z.string().optional(),
  summary: z.string(),
  bullets: z.array(z.string()).optional(),
  caveats: z.array(z.string()).optional(),
  suggestedQuestion: z.string().optional(),
});

export type GastiResponseKind = z.infer<typeof gastiResponseKindSchema>;
export type GastiStructuredResponse = z.infer<typeof gastiStructuredResponseSchema>;

const GENERIC_GASTI_RESPONSE_FALLBACK = 'No pude armar una respuesta confiable con los datos disponibles.';
const HEADING_KINDS = new Set<GastiResponseKind>(['financial_insight', 'comparison', 'breakdown']);

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeOptionalStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((entry) => normalizeOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));

  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeGastiStructuredResponse(input: unknown): GastiStructuredResponse | null {
  const parsed = gastiStructuredResponseSchema.safeParse(input);

  if (!parsed.success) {
    return null;
  }

  const headline = normalizeOptionalString(parsed.data.headline);
  const summary = normalizeOptionalString(parsed.data.summary);

  if (!summary) {
    return null;
  }

  const bullets = normalizeOptionalStringList(parsed.data.bullets);
  const caveats = normalizeOptionalStringList(parsed.data.caveats);
  const suggestedQuestion = normalizeOptionalString(parsed.data.suggestedQuestion);

  return {
    kind: parsed.data.kind,
    summary,
    ...(headline ? { headline } : {}),
    ...(bullets ? { bullets } : {}),
    ...(caveats ? { caveats } : {}),
    ...(suggestedQuestion ? { suggestedQuestion } : {}),
  };
}

export function buildGastiResponseMarkdown(response: GastiStructuredResponse): string {
  const sections: string[] = [];
  const shouldRenderHeading = Boolean(response.headline) && HEADING_KINDS.has(response.kind);

  if (shouldRenderHeading) {
    sections.push(`### ${response.headline}`);
  } else if (response.headline && response.kind !== 'greeting') {
    sections.push(response.headline);
  }

  sections.push(response.summary);

  if (response.bullets && response.bullets.length > 0) {
    sections.push(response.bullets.map((bullet) => `- ${bullet}`).join('\n'));
  }

  if (response.caveats && response.caveats.length > 0) {
    sections.push(`_Nota: ${response.caveats.join(' ')}_`);
  }

  if (response.suggestedQuestion) {
    sections.push(response.suggestedQuestion);
  }

  return sections.join('\n\n');
}

export function buildSafeGastiResponseFallback(rawText?: string): string {
  return normalizeOptionalString(rawText) ?? GENERIC_GASTI_RESPONSE_FALLBACK;
}
