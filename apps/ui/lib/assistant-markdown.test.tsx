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

test('AssistantMarkdown renders asterisk bullets as list items', () => {
  const html = renderToStaticMarkup(<AssistantMarkdown content="* Vivienda" />);

  assert.match(html, /<ul/);
  assert.match(html, /<li>Vivienda<\/li>/);
});

test('AssistantMarkdown renders asterisk bullets with extra spaces as list items', () => {
  const html = renderToStaticMarkup(<AssistantMarkdown content="*   Vivienda" />);

  assert.match(html, /<ul/);
  assert.match(html, /<li>Vivienda<\/li>/);
});

test('AssistantMarkdown renders plus bullets as list items', () => {
  const html = renderToStaticMarkup(<AssistantMarkdown content="+ Vivienda" />);

  assert.match(html, /<ul/);
  assert.match(html, /<li>Vivienda<\/li>/);
});

test('AssistantMarkdown preserves strong text inside asterisk bullet items', () => {
  const html = renderToStaticMarkup(<AssistantMarkdown content="*   **Vivienda**: ARS 250.000" />);

  assert.match(html, /<ul/);
  assert.match(html, /<li><strong>Vivienda<\/strong>: ARS 250\.000<\/li>/);
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

test('parseAssistantMarkdown keeps paragraphs and lists separated without blank lines around the list block', () => {
  assert.deepEqual(
    parseAssistantMarkdown(
      [
        'En mayo de 2026, gastaste un total de ARS 499.698.',
        'Tus principales gastos fueron:',
        '*   **Vivienda**: ARS 250.000 (50.03% del total)',
        '*   **Salud**: ARS 83.900 (16.79% del total)',
        '*   **Compras**: ARS 45.000 (9.01% del total)',
        'La transacción más grande fue de ARS 250.000.',
      ].join('\n'),
    ),
    [
      {
        kind: 'paragraph',
        text: ['En mayo de 2026, gastaste un total de ARS 499.698.', 'Tus principales gastos fueron:'].join('\n'),
      },
      {
        kind: 'list',
        items: [
          '**Vivienda**: ARS 250.000 (50.03% del total)',
          '**Salud**: ARS 83.900 (16.79% del total)',
          '**Compras**: ARS 45.000 (9.01% del total)',
        ],
      },
      {
        kind: 'paragraph',
        text: 'La transacción más grande fue de ARS 250.000.',
      },
    ],
  );
});

test('parseAssistantMarkdown does not treat emphasis in prose as a list', () => {
  assert.deepEqual(parseAssistantMarkdown('Esto es *importante* para entender el gasto.'), [
    {
      kind: 'paragraph',
      text: 'Esto es *importante* para entender el gasto.',
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
