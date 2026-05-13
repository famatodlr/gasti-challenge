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

export function parseAssistantMarkdown(content: string): AssistantMarkdownBlock[] {
  return content
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean)
    .map((section) => {
      const lines = section
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length > 0 && lines.every((line) => line.startsWith('- '))) {
        return {
          kind: 'list',
          items: lines.map((line) => line.slice(2).trim()),
        };
      }

      return {
        kind: 'paragraph',
        text: section,
      };
    });
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
