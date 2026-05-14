export type GastiWorkflowIntent = 'monthly_review' | 'greeting_snapshot' | 'agent';

const monthWords = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'setiembre',
  'octubre',
  'noviembre',
  'diciembre',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const greetingMessages = new Set([
  'arranquemos',
  'buen dia',
  'buenas',
  'buenos dias',
  'empecemos',
  'hola',
  'que onda',
]);

const financeQuestionSignals = [
  'abril',
  'ahorro',
  'categoria',
  'compar',
  'contra',
  'cuanto',
  'cuánto',
  'financ',
  'gaste',
  'gasté',
  'gasto',
  'gastos',
  'mayo',
  'mes',
  'plata',
  'resumen',
  'review',
];

const comparisonSignals = ['compar', 'contra', 'vs', 'versus', 'respecto de'];

function normalizeForIntent(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR')
    .replace(/[¿?¡!.,;:()"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isGreetingFinancialSnapshotIntent(message: string): boolean {
  const normalizedMessage = normalizeForIntent(message);

  if (!greetingMessages.has(normalizedMessage)) {
    return false;
  }

  return !financeQuestionSignals.some((signal) => {
    const normalizedSignal = normalizeForIntent(signal);
    return normalizedSignal !== normalizedMessage && normalizedMessage.includes(normalizedSignal);
  });
}

export function isMonthlyFinancialReviewIntent(message: string): boolean {
  const normalizedMessage = normalizeForIntent(message);
  const hasReviewSignal =
    /\b(resumen|review|revision|balance)\b/.test(normalizedMessage) ||
    /\bcomo me fue\b/.test(normalizedMessage) ||
    /\bmonthly review\b/.test(normalizedMessage);
  const hasComparisonSignal = comparisonSignals.some((signal) => normalizedMessage.includes(normalizeForIntent(signal)));
  const mentionedMonthCount = monthWords.filter((month) => new RegExp(`\\b${month}\\b`).test(normalizedMessage)).length;

  if (hasComparisonSignal && mentionedMonthCount >= 2) {
    return true;
  }

  if (!hasReviewSignal) {
    return false;
  }

  const hasMonthSignal =
    /\beste mes\b/.test(normalizedMessage) ||
    /\bmes actual\b/.test(normalizedMessage) ||
    /\bmonth\b/.test(normalizedMessage) ||
    monthWords.some((month) => new RegExp(`\\b${month}\\b`).test(normalizedMessage));

  const asksFinancialReview =
    /\bfinancier/.test(normalizedMessage) ||
    /\bgastos?\b/.test(normalizedMessage) ||
    /\bmensual\b/.test(normalizedMessage);

  return hasMonthSignal || asksFinancialReview;
}

export function detectGastiWorkflowIntent(message: string): GastiWorkflowIntent {
  if (isMonthlyFinancialReviewIntent(message)) {
    return 'monthly_review';
  }

  if (isGreetingFinancialSnapshotIntent(message)) {
    return 'greeting_snapshot';
  }

  return 'agent';
}
