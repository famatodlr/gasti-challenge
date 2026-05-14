import type { ReactNode } from 'react';

export type AssistantMarkdownBlock =
  | {
      kind: 'heading';
      level: 2 | 3;
      text: string;
    }
  | {
      kind: 'paragraph';
      text: string;
    }
  | {
      kind: 'list';
      items: string[];
    }
  | {
      kind: 'note';
      text: string;
    };

const UNORDERED_LIST_ITEM_PATTERN = /^[-*+]\s+(\S.*)$/;
const HEADING_PATTERN = /^(#{2,3})\s+(\S.*)$/;
const NOTE_PATTERN = /^(nota|note|caveat|ojo)\s*:\s*(\S.*)$/i;
const FINANCIAL_NUMBER_PATTERN =
  /((?:ARS|\$)\s?-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:[.,]\d+)?%|(?:subi[oó]|baj[oó]|variaci[oó]n|delta)\s*-?\d+(?:[.,]\d+)?%)/gi;

export type AssistantAnswerUi = {
  headline?: string;
  summary?: string;
  bullets?: string[];
  note?: string;
  suggestedQuestion?: string;
};

function readMaybeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readMaybeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const next = value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
  return next.length > 0 ? next : undefined;
}

export function normalizeAnswerUi(value: unknown): AssistantAnswerUi | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const headline = readMaybeString(record.headline) ?? readMaybeString(record.title);
  const summary = readMaybeString(record.summary) ?? readMaybeString(record.body);
  const bullets = readMaybeStringArray(record.bullets) ?? readMaybeStringArray(record.highlights);
  const note = readMaybeString(record.note) ?? readMaybeString(record.caveat);
  const suggestedQuestion =
    readMaybeString(record.suggestedQuestion) ?? readMaybeString(record.nextQuestion) ?? readMaybeString(record.question);

  if (!headline && !summary && !bullets && !note && !suggestedQuestion) {
    return null;
  }

  return { headline, summary, ...(bullets ? { bullets } : {}), note, suggestedQuestion };
}

export function inferSuggestedQuestion(content: string): string | null {
  const lines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const finalLine = lines.at(-1);

  if (!finalLine || !finalLine.endsWith('?') || finalLine.length < 12 || finalLine.length > 140) {
    return null;
  }

  return finalLine;
}

export function parseAssistantMarkdown(content: string): AssistantMarkdownBlock[] {
  const blocks: AssistantMarkdownBlock[] = [];
  const paragraphLines: string[] = [];
  const listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push({
      kind: 'paragraph',
      text: paragraphLines.join('\n'),
    });
    paragraphLines.length = 0;
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    blocks.push({
      kind: 'list',
      items: [...listItems],
    });
    listItems.length = 0;
  };

  for (const rawLine of content.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(HEADING_PATTERN);

    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: 'heading',
        level: headingMatch[1].length === 2 ? 2 : 3,
        text: headingMatch[2],
      });
      continue;
    }

    const listMatch = line.match(UNORDERED_LIST_ITEM_PATTERN);

    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1]);
      continue;
    }

    const noteMatch = line.match(NOTE_PATTERN);

    if (noteMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: 'note',
        text: noteMatch[2],
      });
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function renderFinancialInline(text: string): ReactNode[] {
  const parts = text.split(FINANCIAL_NUMBER_PATTERN);
  const nodes: ReactNode[] = [];
  let emphasisKey = 0;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];

    if (!part) {
      continue;
    }

    if (index % 2 === 1) {
      nodes.push(
        <span key={`num-${emphasisKey++}`} className="font-semibold text-[var(--accent-primary)]">
          {part}
        </span>,
      );
      continue;
    }

    nodes.push(part);
  }

  return nodes;
}

function renderInlineStrong(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const opening = remaining.indexOf('**');

    if (opening === -1) {
      nodes.push(...renderFinancialInline(remaining));
      break;
    }

    const closing = remaining.indexOf('**', opening + 2);

    if (closing === -1) {
      nodes.push(...renderFinancialInline(remaining));
      break;
    }

    if (opening > 0) {
      nodes.push(...renderFinancialInline(remaining.slice(0, opening)));
    }

    const strongText = remaining.slice(opening + 2, closing);
    nodes.push(<strong key={`strong-${key++}`}>{strongText}</strong>);
    remaining = remaining.slice(closing + 2);
  }

  return nodes;
}

export function AssistantMarkdown({ content }: { content: string }) {
  const blocks = parseAssistantMarkdown(content);

  return (
    <div className="space-y-3.5">
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          const className =
            block.level === 2 ? 'text-base font-semibold text-[var(--text-primary)]' : 'text-sm font-semibold text-[var(--text-secondary)]';
          return (
            <h3 key={`heading-${index}`} className={className}>
              {renderInlineStrong(block.text)}
            </h3>
          );
        }

        if (block.kind === 'list') {
          return (
            <ul key={`list-${index}`} className="space-y-2">
              {block.items.map((item, itemIndex) => (
                <li key={`item-${itemIndex}`} className="flex items-start gap-2 text-[var(--text-secondary)]">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-dim)]" aria-hidden="true" />
                  <span>{renderInlineStrong(item)}</span>
                </li>
              ))}
            </ul>
          );
        }

        if (block.kind === 'note') {
          return (
            <p
              key={`note-${index}`}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2 text-xs leading-5 text-[var(--text-muted)]"
            >
              {renderInlineStrong(block.text)}
            </p>
          );
        }

        return (
          <p key={`paragraph-${index}`} className="leading-7 text-[var(--text-secondary)]">
            {renderInlineStrong(block.text)}
          </p>
        );
      })}
    </div>
  );
}

export function PlainChatText({ content }: { content: string }) {
  return <>{content}</>;
}
