import type { ReactNode } from 'react';

export type AssistantMarkdownBlock =
  | {
      kind: 'paragraph';
      text: string;
    }
  | {
      kind: 'list';
      items: string[];
    };

const UNORDERED_LIST_ITEM_PATTERN = /^[-*+]\s+(\S.*)$/;

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

    const listMatch = line.match(UNORDERED_LIST_ITEM_PATTERN);

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

  return blocks;
}

function renderInlineStrong(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const opening = remaining.indexOf('**');

    if (opening === -1) {
      nodes.push(remaining);
      break;
    }

    const closing = remaining.indexOf('**', opening + 2);

    if (closing === -1) {
      nodes.push(remaining);
      break;
    }

    if (opening > 0) {
      nodes.push(remaining.slice(0, opening));
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
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.kind === 'list') {
          return (
            <ul key={`list-${index}`} className="ml-5 list-disc space-y-1">
              {block.items.map((item, itemIndex) => (
                <li key={`item-${itemIndex}`}>{renderInlineStrong(item)}</li>
              ))}
            </ul>
          );
        }

        return <p key={`paragraph-${index}`}>{renderInlineStrong(block.text)}</p>;
      })}
    </div>
  );
}

export function PlainChatText({ content }: { content: string }) {
  return <>{content}</>;
}
