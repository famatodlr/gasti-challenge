import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  AssistantMarkdown,
  normalizeAnswerUi,
  parseAssistantMarkdown,
} from './assistant-markdown';

test('parseAssistantMarkdown supports headings, lists, notes, and paragraphs', () => {
  assert.deepEqual(
    parseAssistantMarkdown('## Resumen\n\n- Vivienda\n\nNota: revisar servicios\n\nCierre final'),
    [
      { kind: 'heading', level: 2, text: 'Resumen' },
      { kind: 'list', items: ['Vivienda'] },
      { kind: 'note', text: 'revisar servicios' },
      { kind: 'paragraph', text: 'Cierre final' },
    ],
  );
});

test('AssistantMarkdown renders number emphasis for ARS and percentages', () => {
  const html = renderToStaticMarkup(<AssistantMarkdown content="Total ARS 250.000 y variación 15%." />);
  assert.match(html, /font-semibold text-\[var\(--accent-primary\)\]/);
});

test('AssistantMarkdown renders clean bullet rows and safe text escaping', () => {
  const html = renderToStaticMarkup(<AssistantMarkdown content="- Vivienda\n- <script>alert(1)</script>" />);
  assert.match(html, /<ul/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('normalizeAnswerUi accepts supported optional fields', () => {
  assert.deepEqual(
    normalizeAnswerUi({ title: 'Resumen', body: 'Hola', highlights: ['Uno'], caveat: 'Ojo', suggestedQuestion: 'Seguimos?' }),
    { headline: 'Resumen', summary: 'Hola', bullets: ['Uno'], note: 'Ojo' },
  );
});
