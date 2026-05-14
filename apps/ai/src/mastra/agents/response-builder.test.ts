import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGastiResponseMarkdown,
  buildSafeGastiResponseFallback,
  normalizeGastiStructuredResponse,
} from './response-builder.ts';

test('renders a short answer with only summary', () => {
  const response = normalizeGastiStructuredResponse({
    kind: 'short_answer',
    summary: 'Sí. Conviene comparar mayo contra abril hasta el mismo día.',
  });

  assert.ok(response);
  assert.equal(
    buildGastiResponseMarkdown(response),
    'Sí. Conviene comparar mayo contra abril hasta el mismo día.',
  );
});

test('renders a comparison with headline, summary, bullets, caveats, and suggested question', () => {
  const response = normalizeGastiStructuredResponse({
    kind: 'comparison',
    headline: 'Mayo viene más alto que abril',
    summary: 'Hasta el 13/05 gastaste **ARS 499.698**. La comparación usa abril hasta el mismo día.',
    bullets: [
      'Delivery fue el principal driver de la suba.',
      'Salud también aumentó.',
      'Transporte se mantuvo relativamente estable.',
    ],
    caveats: ['Mayo todavía está incompleto.'],
    suggestedQuestion: '¿Querés ver qué comercios explican más la suba?',
  });

  assert.ok(response);
  assert.equal(
    buildGastiResponseMarkdown(response),
    [
      '### Mayo viene más alto que abril',
      '',
      'Hasta el 13/05 gastaste **ARS 499.698**. La comparación usa abril hasta el mismo día.',
      '',
      '- Delivery fue el principal driver de la suba.',
      '- Salud también aumentó.',
      '- Transporte se mantuvo relativamente estable.',
      '',
      '_Nota: Mayo todavía está incompleto._',
      '',
      '¿Querés ver qué comercios explican más la suba?',
    ].join('\n'),
  );
});

test('renders a greeting with summary, bullets, and suggested question', () => {
  const response = normalizeGastiStructuredResponse({
    kind: 'greeting',
    summary: '¡Buenas! Mayo viene un poco más alto que tu ritmo habitual.',
    bullets: [
      'Delivery está empujando la suba.',
      'Todavía estás a tiempo de ajustar el resto del mes.',
    ],
    suggestedQuestion: '¿Querés que te muestre en qué se fue más plata este mes?',
  });

  assert.ok(response);
  assert.equal(
    buildGastiResponseMarkdown(response),
    [
      '¡Buenas! Mayo viene un poco más alto que tu ritmo habitual.',
      '',
      '- Delivery está empujando la suba.',
      '- Todavía estás a tiempo de ajustar el resto del mes.',
      '',
      '¿Querés que te muestre en qué se fue más plata este mes?',
    ].join('\n'),
  );
});

test('trims whitespace and drops empty bullets and caveats', () => {
  const response = normalizeGastiStructuredResponse({
    kind: 'financial_insight',
    headline: '  Gasto en delivery  ',
    summary: '  Subió frente al período anterior.  ',
    bullets: ['  Rappi explicó la mayor parte. ', ' ', '\n'],
    caveats: ['  Mayo está incompleto. ', '', '   '],
    suggestedQuestion: '  ¿Querés ver el detalle por comercio?  ',
  });

  assert.deepEqual(response, {
    kind: 'financial_insight',
    headline: 'Gasto en delivery',
    summary: 'Subió frente al período anterior.',
    bullets: ['Rappi explicó la mayor parte.'],
    caveats: ['Mayo está incompleto.'],
    suggestedQuestion: '¿Querés ver el detalle por comercio?',
  });
});

test('does not render empty sections', () => {
  const response = normalizeGastiStructuredResponse({
    kind: 'breakdown',
    headline: 'Detalle',
    summary: 'Acá va el resumen.',
    bullets: [],
    caveats: [],
    suggestedQuestion: '   ',
  });

  assert.ok(response);
  assert.equal(buildGastiResponseMarkdown(response), ['### Detalle', '', 'Acá va el resumen.'].join('\n'));
});

test('preserves more than three bullets', () => {
  const response = normalizeGastiStructuredResponse({
    kind: 'breakdown',
    summary: 'Resumen.',
    bullets: ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'],
  });

  assert.ok(response);
  const markdown = buildGastiResponseMarkdown(response);
  assert.match(markdown, /- Uno/);
  assert.match(markdown, /- Dos/);
  assert.match(markdown, /- Tres/);
  assert.match(markdown, /- Cuatro/);
  assert.match(markdown, /- Cinco/);
});

test('falls back safely for invalid structured content', () => {
  assert.equal(
    normalizeGastiStructuredResponse({
      kind: 'comparison',
      summary: '   ',
    }),
    null,
  );

  assert.equal(buildSafeGastiResponseFallback(), 'No pude armar una respuesta confiable con los datos disponibles.');
  assert.equal(
    buildSafeGastiResponseFallback('  Respuesta simple ya armada.  '),
    'Respuesta simple ya armada.',
  );
});
