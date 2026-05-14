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
});

export type GastiResponseKind = z.infer<typeof gastiResponseKindSchema>;
export type GastiStructuredResponse = z.infer<typeof gastiStructuredResponseSchema>;

const GENERIC_GASTI_RESPONSE_FALLBACK = 'No pude armar una respuesta confiable con los datos disponibles.';
const HEADING_KINDS = new Set<GastiResponseKind>(['financial_insight', 'comparison', 'breakdown']);
const INLINE_BULLET_MARKER_PATTERN = /(^|\s)([*+-])\s+(?=\S)/g;
const UNORDERED_LIST_LINE_PATTERN = /^\s*[*+-]\s+(\S.*)$/;

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

type InlineBulletRecovery = {
  leadingText?: string;
  items: string[];
};

function recoverInlineBulletRun(section: string): InlineBulletRecovery | null {
  const matches = Array.from(section.matchAll(INLINE_BULLET_MARKER_PATTERN));

  if (matches.length < 2) {
    return null;
  }

  const marker = matches[0]?.[2];

  if (!marker || matches.some((match) => match[2] !== marker)) {
    return null;
  }

  const markerStarts = matches.map((match) => (match.index ?? 0) + match[1].length);
  const markerTokenLength = 2;
  const leadingText = section.slice(0, markerStarts[0]).trim();

  if (marker === '-' && leadingText && !leadingText.endsWith(':')) {
    return null;
  }

  const items = markerStarts
    .map((start, index) => {
      const nextStart = markerStarts[index + 1] ?? section.length;
      return section.slice(start + markerTokenLength, nextStart).trim();
    })
    .filter(Boolean);

  if (items.length < 2) {
    return null;
  }

  return {
    ...(leadingText ? { leadingText } : {}),
    items,
  };
}

function normalizeInlineBulletSection(section: string): string {
  const recovered = recoverInlineBulletRun(section);

  if (!recovered) {
    return normalizeLineStartBulletBlocks(section);
  }

  const listBlock = recovered.items.map((item) => `- ${item}`).join('\n');

  if (!recovered.leadingText) {
    return listBlock;
  }

  return normalizeLineStartBulletBlocks(`${recovered.leadingText}\n\n${listBlock}`);
}

function normalizeLineStartBulletBlocks(section: string): string {
  const blocks: string[] = [];
  const paragraphLines: string[] = [];
  const listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push(paragraphLines.join('\n'));
    paragraphLines.length = 0;
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    blocks.push(listItems.map((item) => `- ${item}`).join('\n'));
    listItems.length = 0;
  };

  for (const rawLine of section.trim().split('\n')) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const listMatch = line.match(UNORDERED_LIST_LINE_PATTERN);

    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1]);
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks.join('\n\n');
}

function normalizeMarkdownListText(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return '';
  }

  return normalized
    .split(/\n{2,}/)
    .map((section) => normalizeInlineBulletSection(section))
    .filter(Boolean)
    .join('\n\n');
}

function normalizeMarkdownBulletItems(values: readonly string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }

  const normalized = values.flatMap((value) => {
    const recovered = recoverInlineBulletRun(value.replace(/\r\n/g, '\n').trim());

    if (!recovered) {
      const trimmed = value.trim();
      const listMatch = trimmed.match(UNORDERED_LIST_LINE_PATTERN);
      const normalized = listMatch ? listMatch[1] : trimmed;
      return normalized ? [normalized] : [];
    }

    if (recovered.leadingText) {
      return [recovered.leadingText, ...recovered.items];
    }

    return recovered.items;
  });

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
  return {
    kind: parsed.data.kind,
    summary,
    ...(headline ? { headline } : {}),
    ...(bullets ? { bullets } : {}),
    ...(caveats ? { caveats } : {}),
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

  sections.push(normalizeMarkdownListText(response.summary));

  const normalizedBullets = normalizeMarkdownBulletItems(response.bullets);

  if (normalizedBullets && normalizedBullets.length > 0) {
    sections.push(normalizedBullets.map((bullet) => `- ${bullet}`).join('\n'));
  }

  if (response.caveats && response.caveats.length > 0) {
    sections.push(`_Nota: ${response.caveats.join(' ')}_`);
  }

  return sections.join('\n\n');
}

export function buildSafeGastiResponseFallback(rawText?: string): string {
  const normalized = normalizeOptionalString(rawText);
  return normalized ? normalizeMarkdownListText(normalized) : GENERIC_GASTI_RESPONSE_FALLBACK;
}
