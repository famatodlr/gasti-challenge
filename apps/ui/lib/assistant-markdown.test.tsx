import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { AssistantMarkdown, PlainChatText, parseAssistantMarkdown } from './assistant-markdown';

test('AssistantMarkdown renders strong text for important amounts', () => {
  const html = renderToStaticMarkup(<AssistantMarkdown content="Meta: **ARS 1.000.000**" />);

  assert.match(html, /<strong>ARS 1\.000\.000<\/strong>/);
});

test('AssistantMarkdown renders markdown bullets as list items with strong text', () => {
  const html = renderToStaticMarkup(<AssistantMarkdown content="- **Vivienda:** ARS 250.000" />);

  assert.match(html, /<ul/);
  assert.match(html, /<li/);
  assert.match(html, /<strong>Vivienda:<\/strong> ARS 250\.000/);
});

test('parseAssistantMarkdown separates paragraphs on blank lines', () => {
  assert.deepEqual(parseAssistantMarkdown('En **abril** gastaste ARS 10.\n\nMi lectura: bajó.'), [
    {
      kind: 'paragraph',
      text: 'En **abril** gastaste ARS 10.',
    },
    {
      kind: 'paragraph',
      text: 'Mi lectura: bajó.',
    },
  ]);
});

test('AssistantMarkdown escapes raw HTML-like text', () => {
  const html = renderToStaticMarkup(<AssistantMarkdown content="<script>alert('x')</script>" />);

  assert.equal(html.includes('<script>'), false);
  assert.match(html, /&lt;script&gt;alert/);
});

test('PlainChatText keeps user markdown markers as plain text', () => {
  const html = renderToStaticMarkup(<PlainChatText content="Quiero **ahorrar**\n- no lista" />);

  assert.equal(html.includes('<strong>'), false);
  assert.equal(html.includes('<ul'), false);
  assert.match(html, /\*\*ahorrar\*\*/);
  assert.match(html, /- no lista/);
});
