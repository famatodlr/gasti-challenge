const DATASET_AVAILABILITY_PATTERNS = [
  /\bque transacciones(?: tenes| tienes)? registradas\b/i,
  /\btransacciones registradas\b/i,
  /\bque datos(?: tenes| tienes)?\b/i,
  /\bdataset\b/i,
  /\brango\b/i,
  /\bcobertura\b/i,
  /\bhasta (?:que|qué|cuando|cuándo)\b/i,
  /\bdisponible\b/i,
];

const COMPARISON_PATTERNS = [/\bcompar/i, /\bvs\b/i, /\brespecto de\b/i, /\bmas que\b/i, /\bmenos que\b/i];
const RECURRING_PATTERNS = [/\brecurrent/i, /\bsuscrip/i, /\bfijos?\b/i, /\bzombie\b/i];
const FORECAST_PATTERNS = [/\ba este ritmo\b/i, /\bfin de mes\b/i, /\bproyecci[oó]n\b/i];
const TRANSACTION_DETAIL_PATTERNS = [/\bmostra/i, /\bwhich transactions\b/i, /\bdetalle/i];
const SPEND_PATTERNS = [/\bcu[aá]nto\b/i, /\bgast[ée]\b/i, /\bgasto\b/i];
const INCOME_PATTERNS = [/\bingreso\b/i, /\bsueldo\b/i, /\bsalary\b/i, /\bahorro\b/i, /\btasa de ahorro\b/i];

const MONTH_NAMES = [
  { month: 1, aliases: ['enero', 'january'] },
  { month: 2, aliases: ['febrero', 'february'] },
  { month: 3, aliases: ['marzo', 'march'] },
  { month: 4, aliases: ['abril', 'april'] },
  { month: 5, aliases: ['mayo', 'may'] },
  { month: 6, aliases: ['junio', 'june'] },
  { month: 7, aliases: ['julio', 'july'] },
  { month: 8, aliases: ['agosto', 'august'] },
  { month: 9, aliases: ['septiembre', 'setiembre', 'september'] },
  { month: 10, aliases: ['octubre', 'october'] },
  { month: 11, aliases: ['noviembre', 'november'] },
  { month: 12, aliases: ['diciembre', 'december'] },
] as const;

export type FinanceGroundingQuestionType =
  | 'dataset_availability'
  | 'merchant_spend'
  | 'aggregate_spend'
  | 'comparison'
  | 'recurring'
  | 'forecast'
  | 'income_sensitive'
  | 'transaction_details'
  | 'non_finance';

export type FinanceGroundingPolicy = {
  questionType: FinanceGroundingQuestionType;
  acceptableFinanceTools: string[];
  requiresGrounding: boolean;
  requiresFinanceContext: boolean;
  bareMonthDetected: boolean;
  mustResolveBareMonthFromContext: boolean;
  coverageClaimsForbiddenWithoutEvidence: boolean;
  incomeClaimsForbiddenWithoutEvidence: boolean;
  currentTurnEvidenceRequired: boolean;
};

export type FinanceContextMonthLike = {
  year: number;
  month: number;
  label: string;
};

export type BareMonthResolution =
  | {
      status: 'resolved';
      year: number;
      month: number;
      label: string;
    }
  | {
      status: 'ambiguous';
      monthName: string;
      matchingLabels: string[];
    }
  | {
      status: 'not_found';
      monthName: string;
    };

function includesAnyPattern(input: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(input));
}

function detectMentionedMonthName(input: string): string | null {
  const normalizedInput = input.toLowerCase();

  for (const monthEntry of MONTH_NAMES) {
    for (const alias of monthEntry.aliases) {
      if (new RegExp(`\\b${alias}\\b`, 'i').test(normalizedInput)) {
        return monthEntry.aliases[0];
      }
    }
  }

  return null;
}

function detectBareMonth(input: string): { bareMonthDetected: boolean; monthName?: string } {
  const monthName = detectMentionedMonthName(input);

  if (!monthName) {
    return { bareMonthDetected: false };
  }

  if (/\b20\d{2}\b/.test(input)) {
    return { bareMonthDetected: false };
  }

  return { bareMonthDetected: true, monthName };
}

function isLikelyMerchantSpendQuestion(input: string): boolean {
  if (!includesAnyPattern(input, SPEND_PATTERNS)) {
    return false;
  }

  if (/\ben\s+[A-ZÁÉÍÓÚÑ][\p{L}\d._-]*/u.test(input)) {
    return true;
  }

  return /\bnetflix\b/i.test(input);
}

function dedupeTools(tools: readonly string[]): string[] {
  return Array.from(new Set(tools));
}

export function buildFinanceGroundingPolicy(message: string): FinanceGroundingPolicy {
  const trimmedMessage = message.trim();
  const { bareMonthDetected } = detectBareMonth(trimmedMessage);
  const lowerMessage = trimmedMessage.toLowerCase();
  let questionType: FinanceGroundingQuestionType = 'non_finance';

  if (includesAnyPattern(lowerMessage, DATASET_AVAILABILITY_PATTERNS)) {
    questionType = 'dataset_availability';
  } else if (includesAnyPattern(lowerMessage, INCOME_PATTERNS)) {
    questionType = 'income_sensitive';
  } else if (includesAnyPattern(lowerMessage, COMPARISON_PATTERNS)) {
    questionType = 'comparison';
  } else if (includesAnyPattern(lowerMessage, RECURRING_PATTERNS)) {
    questionType = 'recurring';
  } else if (includesAnyPattern(lowerMessage, FORECAST_PATTERNS)) {
    questionType = 'forecast';
  } else if (includesAnyPattern(lowerMessage, TRANSACTION_DETAIL_PATTERNS)) {
    questionType = 'transaction_details';
  } else if (isLikelyMerchantSpendQuestion(trimmedMessage)) {
    questionType = 'merchant_spend';
  } else if (includesAnyPattern(lowerMessage, SPEND_PATTERNS)) {
    questionType = 'aggregate_spend';
  }

  const acceptableFinanceTools = dedupeTools(
    {
      dataset_availability: ['getFinanceContext'],
      merchant_spend: ['findTransactionsTool'],
      aggregate_spend: ['spendingSummaryTool', 'findTransactionsTool'],
      comparison: ['comparePeriodsTool'],
      recurring: ['detectRecurringExpensesTool'],
      forecast: ['forecastMonthEndSpendTool'],
      income_sensitive: ['getFinancialMemory'],
      transaction_details: ['findTransactionsTool'],
      non_finance: [],
    }[questionType],
  );

  const requiresGrounding = questionType !== 'non_finance';
  const requiresFinanceContext =
    questionType === 'dataset_availability' ||
    questionType === 'transaction_details' ||
    (bareMonthDetected && questionType !== 'non_finance') ||
    /\beste mes\b/i.test(trimmedMessage) ||
    /\bmes pasado\b/i.test(trimmedMessage) ||
    /\beste a[nñ]o\b/i.test(trimmedMessage);

  if (requiresFinanceContext && !acceptableFinanceTools.includes('getFinanceContext')) {
    acceptableFinanceTools.unshift('getFinanceContext');
  }

  return {
    questionType,
    acceptableFinanceTools,
    requiresGrounding,
    requiresFinanceContext,
    bareMonthDetected,
    mustResolveBareMonthFromContext: bareMonthDetected,
    coverageClaimsForbiddenWithoutEvidence: requiresGrounding,
    incomeClaimsForbiddenWithoutEvidence: questionType === 'income_sensitive' || requiresGrounding,
    currentTurnEvidenceRequired: requiresGrounding,
  };
}

export function resolveBareMonthFromFinanceContext(
  monthName: string,
  availableMonths: readonly FinanceContextMonthLike[],
): BareMonthResolution {
  const monthEntry = MONTH_NAMES.find(({ aliases }) =>
    aliases.some((alias) => alias.toLowerCase() === monthName.toLowerCase()),
  );

  if (!monthEntry) {
    return { status: 'not_found', monthName };
  }

  const matches = availableMonths
    .filter((availableMonth) => availableMonth.month === monthEntry.month)
    .sort((left, right) => (left.year === right.year ? left.month - right.month : left.year - right.year));

  if (matches.length === 0) {
    return { status: 'not_found', monthName };
  }

  const distinctYears = new Set(matches.map((match) => match.year));

  if (distinctYears.size > 1) {
    return {
      status: 'ambiguous',
      monthName,
      matchingLabels: matches.map((match) => match.label),
    };
  }

  const latestMatch = matches.at(-1)!;

  return {
    status: 'resolved',
    year: latestMatch.year,
    month: latestMatch.month,
    label: latestMatch.label,
  };
}
