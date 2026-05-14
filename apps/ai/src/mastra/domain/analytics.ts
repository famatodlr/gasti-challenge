import {
  categorySchema,
  compareISODate,
  countInclusiveDays,
  dateRangeSchema,
  dateStringSchema,
  getDaysInMonth,
  getISOWeekKey,
  getMonthDateRange,
  getTransactionDateRange,
  isWithinDateRange,
  sortTransactionsDescending,
  type Category,
  type DateRange,
  type Transaction,
} from './transaction.ts';

export type SummaryGroupBy = 'category' | 'merchant' | 'day' | 'week';
export type ComparisonGroupBy = 'category' | 'merchant';
export type TransactionSortBy = 'date_desc' | 'amount_desc' | 'amount_asc';
export type DeltaDirection = 'up' | 'down' | 'flat';
export type RecurringCadence = 'monthly' | 'weekly' | 'irregular_repeat';
export type Confidence = 'high' | 'medium' | 'low';
export type PeriodCompleteness = 'complete' | 'partial';
export type PeriodPartialReason = 'latest_dataset_month_to_date';

export type PeriodMeta = {
  dayCount: number;
  spansSingleMonth: boolean;
  isFullCalendarMonth: boolean;
  isMonthToDate: boolean;
  completeness: PeriodCompleteness;
  partialReason?: PeriodPartialReason;
};

export type SummarizeSpendingInput = {
  dateRange?: DateRange;
  categories?: Category[];
  merchants?: string[];
  groupBy?: SummaryGroupBy;
  includeTopTransactions?: boolean;
  topTransactionLimit?: number;
};

export type SpendingSummaryGroup = {
  key: string;
  label: string;
  total: number;
  count: number;
  sharePct: number;
  transactionIds: string[];
};

export type SpendingSummary = {
  period: DateRange;
  periodMeta: PeriodMeta;
  currency: 'ARS';
  total: number;
  transactionCount: number;
  groups: SpendingSummaryGroup[];
  topGroups: SpendingSummaryGroup[];
  topMerchants: SpendingSummaryGroup[];
  highlights: {
    dominantGroup?: SpendingSummaryGroup;
    dominantMerchant?: SpendingSummaryGroup;
    largestTransaction?: Pick<Transaction, 'id' | 'merchant' | 'category' | 'amount' | 'date'>;
  };
  topTransactions: Transaction[];
  assumptions: string[];
};

export type FindTransactionsInput = {
  dateRange?: DateRange;
  categories?: Category[];
  merchants?: string[];
  query?: string;
  minAmount?: number;
  maxAmount?: number;
  sortBy?: TransactionSortBy;
  limit?: number;
};

export type FindTransactionsResult = {
  period: DateRange;
  periodMeta: PeriodMeta;
  currency: 'ARS';
  filtersApplied: string[];
  filters: {
    dateRange?: DateRange;
    categories?: Category[];
    merchants?: string[];
    query?: string;
    minAmount?: number;
    maxAmount?: number;
    sortBy: TransactionSortBy;
    limit: number;
  };
  total: number;
  transactionCount: number;
  summary: {
    total: number;
    transactionCount: number;
    uniqueMerchants: number;
    topCategories: SpendingSummaryGroup[];
    topMerchants: SpendingSummaryGroup[];
    amountRange: {
      min: number;
      max: number;
    };
  };
  transactions: Transaction[];
};

export type ComparePeriodsInput = {
  currentRange: DateRange;
  baselineRange: DateRange;
  groupBy?: ComparisonGroupBy;
  categories?: Category[];
};

export type PeriodSummary = {
  period: DateRange;
  periodMeta: PeriodMeta;
  total: number;
  transactionCount: number;
};

export type PeriodComparison = {
  currency: 'ARS';
  current: PeriodSummary;
  baseline: PeriodSummary;
  delta: {
    amount: number;
    percent: number | null;
    direction: DeltaDirection;
  };
  groups: Array<{
    key: string;
    label: string;
    currentTotal: number;
    baselineTotal: number;
    deltaAmount: number;
    deltaPercent: number | null;
    driverTransactionIds: string[];
  }>;
  comparisonBasis: {
    mode: 'exact_ranges';
    currentLabel: string;
    baselineLabel: string;
    currentDayCount: number;
    baselineDayCount: number;
    sameLength: boolean;
    normalized: false;
  };
  topMovers: Array<{
    key: string;
    label: string;
    direction: DeltaDirection;
    deltaAmount: number;
    deltaPercent: number | null;
    driverTransactionIds: string[];
  }>;
  caveats: string[];
};

export type DetectRecurringExpensesInput = {
  dateRange?: DateRange;
  minOccurrences?: number;
  includeVariableRecurring?: boolean;
};

export type RecurringExpenseItem = {
  merchant: string;
  category: Category;
  cadence: RecurringCadence;
  latestAmount: number;
  averageAmount: number;
  estimatedMonthlyAmount: number;
  occurrences: Transaction[];
  confidence: Confidence;
  reason: string;
  possibleZombie: boolean;
  occurrenceCount: number;
  firstSeen: string;
  lastSeen: string;
  classification: 'compromiso' | 'repeticion_variable';
  occurrenceIds: string[];
};

export type RecurringExpensesResult = {
  period: DateRange;
  periodMeta: PeriodMeta;
  currency: 'ARS';
  estimatedMonthlyCommittedSpend: number;
  summary: {
    committedMonthlyTotal: number;
    highConfidenceCount: number;
    possibleZombieCount: number;
    fixedLikeCount: number;
    variableRepeatCount: number;
  };
  items: RecurringExpenseItem[];
  caveats: string[];
};

export type ForecastMonthEndSpendInput = {
  month: string;
  asOfDate: string;
  monthlyIncome?: number;
  monthlyTargetSpend?: number;
  excludeCategoriesFromDailyRunRate?: Category[];
};

export type ForecastMonthEndSpendResult = {
  periodObserved: DateRange;
  periodMeta: PeriodMeta;
  currency: 'ARS';
  observedSpend: number;
  observedFixedSpend: number;
  observedVariableSpend: number;
  elapsedDays: number;
  daysInMonth: number;
  variableDailyAverage: number;
  projectedVariableSpend: number;
  projectedMonthEndSpend: number;
  projectedRange: {
    low: number;
    high: number;
  };
  monthlyIncome?: number;
  projectedSavingsOrDeficit?: number;
  targetGap?: number;
  projectionBasis: {
    mode: 'month_to_date_run_rate';
    observedDayCount: number;
    remainingDayCount: number;
    fixedCategoriesExcludedFromRunRate: Category[];
  };
  drivers: {
    fixedSharePct: number;
    variableSharePct: number;
  };
  assumptions: string[];
  confidence: Confidence;
};

const defaultFixedCategories: Category[] = ['vivienda', 'servicios', 'suscripciones'];
const fixedMerchantHints = new Set([
  'aysa',
  'disney+',
  'edenor',
  'galeno',
  'metrogas',
  'movistar',
  'netflix',
  'personal',
  'propietario',
  'sportclub',
  'spotify',
]);
const forecastFixedMerchantHints = new Set(['propietario']);
const fixedCategoryHints = new Set<Category>(['vivienda', 'servicios', 'suscripciones']);

export function summarizeSpending(
  transactions: readonly Transaction[],
  input: SummarizeSpendingInput = {},
): SpendingSummary {
  const groupBy = input.groupBy ?? 'category';
  const topTransactionLimit = clampInteger(input.topTransactionLimit ?? 5, 1, 10);
  const includeTopTransactions = input.includeTopTransactions ?? true;
  const period = resolvePeriod(transactions, input.dateRange);
  const filteredTransactions = filterTransactions(transactions, input);
  const total = sumTransactions(filteredTransactions);
  const groups = buildSummaryGroups(filteredTransactions, groupBy, total);
  const topMerchants = sliceTopGroups(buildSummaryGroups(filteredTransactions, 'merchant', total));
  const sortedTopTransactions = includeTopTransactions
    ? [...filteredTransactions].sort((a, b) => b.amount - a.amount || sortTransactionsDescending(a, b)).slice(0, topTransactionLimit)
    : [];

  return {
    period,
    periodMeta: buildPeriodMeta(period, transactions),
    currency: 'ARS',
    total,
    transactionCount: filteredTransactions.length,
    groups,
    topGroups: sliceTopGroups(groups),
    topMerchants,
    highlights: {
      dominantGroup: groups[0],
      dominantMerchant: topMerchants[0],
      largestTransaction: buildLargestTransactionHighlight(filteredTransactions),
    },
    topTransactions: sortedTopTransactions,
    assumptions: buildFilterAssumptions(input),
  };
}

export function findTransactions(
  transactions: readonly Transaction[],
  input: FindTransactionsInput = {},
): FindTransactionsResult {
  const limit = clampInteger(input.limit ?? 10, 1, 25);
  const sortBy = input.sortBy ?? 'date_desc';
  const period = resolvePeriod(transactions, input.dateRange);
  const filteredTransactions = filterTransactions(transactions, input);
  const sortedTransactions = sortFoundTransactions(filteredTransactions, sortBy).slice(0, limit);
  const total = sumTransactions(filteredTransactions);

  return {
    period,
    periodMeta: buildPeriodMeta(period, transactions),
    currency: 'ARS',
    filtersApplied: buildFiltersApplied(input),
    filters: {
      ...(input.dateRange ? { dateRange: input.dateRange } : {}),
      ...(input.categories?.length ? { categories: input.categories } : {}),
      ...(input.merchants?.length ? { merchants: input.merchants } : {}),
      ...(input.query ? { query: input.query } : {}),
      ...(input.minAmount !== undefined ? { minAmount: input.minAmount } : {}),
      ...(input.maxAmount !== undefined ? { maxAmount: input.maxAmount } : {}),
      sortBy,
      limit,
    },
    total,
    transactionCount: filteredTransactions.length,
    summary: {
      total,
      transactionCount: filteredTransactions.length,
      uniqueMerchants: countUniqueMerchants(filteredTransactions),
      topCategories: sliceTopGroups(buildSummaryGroups(filteredTransactions, 'category', total)),
      topMerchants: sliceTopGroups(buildSummaryGroups(filteredTransactions, 'merchant', total)),
      amountRange: buildAmountRange(filteredTransactions),
    },
    transactions: sortedTransactions,
  };
}

export function comparePeriods(transactions: readonly Transaction[], input: ComparePeriodsInput): PeriodComparison {
  const currentRange = dateRangeSchema.parse(input.currentRange);
  const baselineRange = dateRangeSchema.parse(input.baselineRange);
  const groupBy = input.groupBy ?? 'category';
  const categoriesFilter = parseCategories(input.categories);
  const currentTransactions = filterTransactions(transactions, { dateRange: currentRange, categories: categoriesFilter });
  const baselineTransactions = filterTransactions(transactions, { dateRange: baselineRange, categories: categoriesFilter });
  const currentTotal = sumTransactions(currentTransactions);
  const baselineTotal = sumTransactions(baselineTransactions);
  const deltaAmount = currentTotal - baselineTotal;
  const groups = buildComparisonGroups(currentTransactions, baselineTransactions, groupBy);
  const currentPeriodMeta = buildPeriodMeta(currentRange, transactions);
  const baselinePeriodMeta = buildPeriodMeta(baselineRange, transactions);

  return {
    currency: 'ARS',
    current: {
      period: currentRange,
      periodMeta: currentPeriodMeta,
      total: currentTotal,
      transactionCount: currentTransactions.length,
    },
    baseline: {
      period: baselineRange,
      periodMeta: baselinePeriodMeta,
      total: baselineTotal,
      transactionCount: baselineTransactions.length,
    },
    delta: {
      amount: deltaAmount,
      percent: calculatePercentDelta(deltaAmount, baselineTotal),
      direction: getDeltaDirection(deltaAmount),
    },
    groups,
    comparisonBasis: {
      mode: 'exact_ranges',
      currentLabel: buildDateRangeLabel(currentRange, currentPeriodMeta),
      baselineLabel: buildDateRangeLabel(baselineRange, baselinePeriodMeta),
      currentDayCount: currentPeriodMeta.dayCount,
      baselineDayCount: baselinePeriodMeta.dayCount,
      sameLength: currentPeriodMeta.dayCount === baselinePeriodMeta.dayCount,
      normalized: false,
    },
    topMovers: groups.slice(0, 3).map((group) => ({
      key: group.key,
      label: group.label,
      direction: getDeltaDirection(group.deltaAmount),
      deltaAmount: group.deltaAmount,
      deltaPercent: group.deltaPercent,
      driverTransactionIds: group.driverTransactionIds,
    })),
    caveats: buildComparisonCaveats(currentRange, baselineRange),
  };
}

export function detectRecurringExpenses(
  transactions: readonly Transaction[],
  input: DetectRecurringExpensesInput = {},
): RecurringExpensesResult {
  const minOccurrences = clampInteger(input.minOccurrences ?? 2, 2, 4);
  const includeVariableRecurring = input.includeVariableRecurring ?? true;
  const period = resolvePeriod(transactions, input.dateRange);
  const filteredTransactions = filterTransactions(transactions, { dateRange: period });
  const byMerchant = groupByMerchant(filteredTransactions);
  const items = Array.from(byMerchant.entries())
    .flatMap(([merchant, occurrences]) => {
      const sortedOccurrences = [...occurrences].sort((a, b) => compareISODate(a.date, b.date));
      const isFixedHint = isFixedMerchant(merchant) || sortedOccurrences.some((transaction) => fixedCategoryHints.has(transaction.category));

      if (sortedOccurrences.length < minOccurrences && !isFixedHint) {
        return [];
      }

      if (sortedOccurrences.length < minOccurrences) {
        return [];
      }

      if (!includeVariableRecurring && !isFixedHint) {
        return [];
      }

      return [buildRecurringItem(merchant, sortedOccurrences, isFixedHint)];
    })
    .sort((a, b) => b.estimatedMonthlyAmount - a.estimatedMonthlyAmount || a.merchant.localeCompare(b.merchant));
  const committedMonthlyTotal = items
    .filter((item) => item.classification === 'compromiso')
    .reduce((total, item) => total + item.estimatedMonthlyAmount, 0);

  return {
    period,
    periodMeta: buildPeriodMeta(period, transactions),
    currency: 'ARS',
    estimatedMonthlyCommittedSpend: committedMonthlyTotal,
    summary: {
      committedMonthlyTotal,
      highConfidenceCount: items.filter((item) => item.confidence === 'high').length,
      possibleZombieCount: items.filter((item) => item.possibleZombie).length,
      fixedLikeCount: items.filter((item) => item.classification === 'compromiso').length,
      variableRepeatCount: items.filter((item) => item.classification === 'repeticion_variable').length,
    },
    items,
    caveats: [
      'Recurring detection is heuristic because the mock dataset covers roughly two months.',
      'Repeated restaurants, transport, or marketplaces may indicate habits rather than fixed commitments.',
    ],
  };
}

export function forecastMonthEndSpend(
  transactions: readonly Transaction[],
  input: ForecastMonthEndSpendInput,
): ForecastMonthEndSpendResult {
  const monthRange = getMonthDateRange(input.month);
  const asOfDate = dateStringSchema.parse(input.asOfDate);
  const observedTo = compareISODate(asOfDate, monthRange.to) <= 0 ? asOfDate : monthRange.to;
  const periodObserved = dateRangeSchema.parse({ from: monthRange.from, to: observedTo });
  const fixedCategories = parseCategories(input.excludeCategoriesFromDailyRunRate ?? defaultFixedCategories) ?? defaultFixedCategories;
  const observedTransactions = filterTransactions(transactions, { dateRange: periodObserved });
  const observedFixedSpend = observedTransactions
    .filter((transaction) => fixedCategories.includes(transaction.category) || isForecastFixedMerchant(transaction.merchant))
    .reduce((total, transaction) => total + transaction.amount, 0);
  const observedSpend = sumTransactions(observedTransactions);
  const observedVariableSpend = observedSpend - observedFixedSpend;
  const elapsedDays = countInclusiveDays(periodObserved);
  const [year, monthNumber] = input.month.split('-').map(Number);
  const daysInMonth = getDaysInMonth(year, monthNumber);
  const variableDailyAverage = Math.round(observedVariableSpend / elapsedDays);
  const projectedVariableSpend = Math.round(variableDailyAverage * daysInMonth);
  const projectedMonthEndSpend = observedFixedSpend + projectedVariableSpend;
  const projectedRange = {
    low: observedFixedSpend + Math.round(projectedVariableSpend * 0.85),
    high: observedFixedSpend + Math.round(projectedVariableSpend * 1.15),
  };
  const result: ForecastMonthEndSpendResult = {
    periodObserved,
    periodMeta: buildPeriodMeta(periodObserved, transactions),
    currency: 'ARS',
    observedSpend,
    observedFixedSpend,
    observedVariableSpend,
    elapsedDays,
    daysInMonth,
    variableDailyAverage,
    projectedVariableSpend,
    projectedMonthEndSpend,
    projectedRange,
    projectionBasis: {
      mode: 'month_to_date_run_rate',
      observedDayCount: elapsedDays,
      remainingDayCount: Math.max(daysInMonth - elapsedDays, 0),
      fixedCategoriesExcludedFromRunRate: fixedCategories,
    },
    drivers: {
      fixedSharePct: observedSpend === 0 ? 0 : roundToTwo((observedFixedSpend / observedSpend) * 100),
      variableSharePct: observedSpend === 0 ? 0 : roundToTwo((observedVariableSpend / observedSpend) * 100),
    },
    assumptions: [
      `Fixed spend uses categories ${fixedCategories.join(', ')} plus known fixed merchants such as Propietario.`,
      `Variable spend is projected from ${elapsedDays} observed day${elapsedDays === 1 ? '' : 's'} in ${input.month}.`,
      'The projection does not infer future one-off purchases that are absent from the observed data.',
    ],
    confidence: getForecastConfidence(elapsedDays, daysInMonth),
  };

  if (input.monthlyIncome !== undefined) {
    result.monthlyIncome = input.monthlyIncome;
    result.projectedSavingsOrDeficit = input.monthlyIncome - projectedMonthEndSpend;
  }

  if (input.monthlyTargetSpend !== undefined) {
    result.targetGap = input.monthlyTargetSpend - projectedMonthEndSpend;
  }

  return result;
}

function resolvePeriod(transactions: readonly Transaction[], dateRange?: DateRange): DateRange {
  if (dateRange) {
    return dateRangeSchema.parse(dateRange);
  }

  return getTransactionDateRange(transactions);
}

function buildPeriodMeta(period: DateRange, transactions: readonly Transaction[]): PeriodMeta {
  const latestTransactionDate = getTransactionDateRange(transactions).to;
  const latestTransactionMonth = latestTransactionDate.slice(0, 7);
  const periodMonth = period.from.slice(0, 7);
  const spansSingleMonth = periodMonth === period.to.slice(0, 7);
  const fullMonthRange = spansSingleMonth ? getMonthDateRange(periodMonth) : undefined;
  const isFullCalendarMonth = spansSingleMonth && period.from === fullMonthRange?.from && period.to === fullMonthRange.to;
  const latestDateInPeriodMonth =
    spansSingleMonth
      ? transactions
          .filter((transaction) => transaction.date.startsWith(periodMonth))
          .map((transaction) => transaction.date)
          .sort(compareISODate)
          .at(-1)
      : undefined;
  const isMonthToDate =
    spansSingleMonth && period.from.endsWith('-01') && latestDateInPeriodMonth !== undefined && period.to === latestDateInPeriodMonth;
  const isLatestDatasetMonthToDate = isMonthToDate && periodMonth === latestTransactionMonth && period.to === latestTransactionDate;

  return {
    dayCount: countInclusiveDays(period),
    spansSingleMonth,
    isFullCalendarMonth,
    isMonthToDate,
    completeness: isLatestDatasetMonthToDate ? 'partial' : 'complete',
    ...(isLatestDatasetMonthToDate ? { partialReason: 'latest_dataset_month_to_date' as const } : {}),
  };
}

function filterTransactions(
  transactions: readonly Transaction[],
  input: {
    dateRange?: DateRange;
    categories?: Category[];
    merchants?: string[];
    query?: string;
    minAmount?: number;
    maxAmount?: number;
  },
): Transaction[] {
  const dateRange = input.dateRange ? dateRangeSchema.parse(input.dateRange) : undefined;
  const categoryFilter = parseCategories(input.categories);
  const merchantFilter = input.merchants?.map(normalizeText);
  const query = input.query ? normalizeText(input.query) : undefined;

  return transactions.filter((transaction) => {
    if (dateRange && !isWithinDateRange(transaction, dateRange)) {
      return false;
    }

    if (categoryFilter && !categoryFilter.includes(transaction.category)) {
      return false;
    }

    if (merchantFilter && !merchantFilter.includes(normalizeText(transaction.merchant))) {
      return false;
    }

    if (query) {
      const searchableText = normalizeText(`${transaction.merchant} ${transaction.description}`);
      if (!searchableText.includes(query)) {
        return false;
      }
    }

    if (input.minAmount !== undefined && transaction.amount < input.minAmount) {
      return false;
    }

    if (input.maxAmount !== undefined && transaction.amount > input.maxAmount) {
      return false;
    }

    return true;
  });
}

function buildLargestTransactionHighlight(
  transactions: readonly Transaction[],
): Pick<Transaction, 'id' | 'merchant' | 'category' | 'amount' | 'date'> | undefined {
  const largestTransaction = [...transactions].sort((a, b) => b.amount - a.amount || sortTransactionsDescending(a, b))[0];

  if (!largestTransaction) {
    return undefined;
  }

  return {
    id: largestTransaction.id,
    merchant: largestTransaction.merchant,
    category: largestTransaction.category,
    amount: largestTransaction.amount,
    date: largestTransaction.date,
  };
}

function sliceTopGroups(groups: readonly SpendingSummaryGroup[], limit = 3): SpendingSummaryGroup[] {
  return groups.slice(0, limit);
}

function buildAmountRange(transactions: readonly Transaction[]): { min: number; max: number } {
  if (transactions.length === 0) {
    return { min: 0, max: 0 };
  }

  const amounts = transactions.map((transaction) => transaction.amount);
  return {
    min: Math.min(...amounts),
    max: Math.max(...amounts),
  };
}

function countUniqueMerchants(transactions: readonly Transaction[]): number {
  return new Set(transactions.map((transaction) => transaction.merchant)).size;
}

function buildSummaryGroups(
  transactions: readonly Transaction[],
  groupBy: SummaryGroupBy,
  total: number,
): SpendingSummaryGroup[] {
  const groups = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    const key = getGroupKey(transaction, groupBy);
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }

  return Array.from(groups.entries())
    .map(([key, groupTransactions]) => {
      const groupTotal = sumTransactions(groupTransactions);

      return {
        key,
        label: key,
        total: groupTotal,
        count: groupTransactions.length,
        sharePct: total === 0 ? 0 : roundToTwo((groupTotal / total) * 100),
        transactionIds: groupTransactions.map((transaction) => transaction.id),
      };
    })
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

function buildComparisonGroups(
  currentTransactions: readonly Transaction[],
  baselineTransactions: readonly Transaction[],
  groupBy: ComparisonGroupBy,
) {
  const currentGroups = totalByGroup(currentTransactions, groupBy);
  const baselineGroups = totalByGroup(baselineTransactions, groupBy);
  const keys = new Set([...currentGroups.keys(), ...baselineGroups.keys()]);

  return Array.from(keys)
    .map((key) => {
      const current = currentGroups.get(key);
      const baseline = baselineGroups.get(key);
      const currentTotal = current?.total ?? 0;
      const baselineTotal = baseline?.total ?? 0;
      const deltaAmount = currentTotal - baselineTotal;
      const driverTransactions = [...(current?.transactions ?? []), ...(baseline?.transactions ?? [])]
        .sort((a, b) => b.amount - a.amount || sortTransactionsDescending(a, b))
        .slice(0, 5);

      return {
        key,
        label: key,
        currentTotal,
        baselineTotal,
        deltaAmount,
        deltaPercent: calculatePercentDelta(deltaAmount, baselineTotal),
        driverTransactionIds: driverTransactions.map((transaction) => transaction.id),
      };
    })
    .sort((a, b) => Math.abs(b.deltaAmount) - Math.abs(a.deltaAmount) || a.key.localeCompare(b.key));
}

function totalByGroup(transactions: readonly Transaction[], groupBy: ComparisonGroupBy) {
  const groups = new Map<string, { total: number; transactions: Transaction[] }>();

  for (const transaction of transactions) {
    const key = getGroupKey(transaction, groupBy);
    const current = groups.get(key) ?? { total: 0, transactions: [] };
    current.total += transaction.amount;
    current.transactions.push(transaction);
    groups.set(key, current);
  }

  return groups;
}

function buildComparisonCaveats(currentRange: DateRange, baselineRange: DateRange): string[] {
  const currentDays = countInclusiveDays(currentRange);
  const baselineDays = countInclusiveDays(baselineRange);

  if (currentDays === baselineDays) {
    return [];
  }

  return [`Periods have different lengths: current has ${currentDays} days and baseline has ${baselineDays} days.`];
}

function buildDateRangeLabel(range: DateRange, periodMeta: PeriodMeta): string {
  if (!periodMeta.spansSingleMonth) {
    return `${range.from} al ${range.to}`;
  }

  const [year, month] = range.from.split('-').map(Number);
  const monthLabel = formatMonthLabel(year, month);

  if (periodMeta.isFullCalendarMonth) {
    return monthLabel;
  }

  if (periodMeta.isMonthToDate) {
    return `${monthLabel} (1 al ${Number(range.to.slice(-2))})`;
  }

  return `${range.from} al ${range.to}`;
}

function buildRecurringItem(
  merchant: string,
  occurrences: Transaction[],
  isFixedHint: boolean,
): RecurringExpenseItem {
  const amounts = occurrences.map((transaction) => transaction.amount);
  const averageAmount = Math.round(amounts.reduce((total, amount) => total + amount, 0) / amounts.length);
  const latest = occurrences[occurrences.length - 1];
  const gaps = getDateGaps(occurrences);
  const averageGap = gaps.length === 0 ? 0 : gaps.reduce((total, gap) => total + gap, 0) / gaps.length;
  const cadence = inferCadence(averageGap);
  const amountSimilarity = calculateAmountSimilarity(amounts);
  const confidence = inferRecurringConfidence(cadence, amountSimilarity, isFixedHint, occurrences.length);
  const estimatedMonthlyAmount = estimateMonthlyAmount(averageAmount, cadence, occurrences);
  const sortedOccurrences = [...occurrences].sort(sortTransactionsDescending);
  const baseItem = {
    merchant,
    category: latest.category,
    cadence,
    latestAmount: latest.amount,
    averageAmount,
    estimatedMonthlyAmount,
    occurrences: sortedOccurrences,
    confidence,
    reason: buildRecurringReason(cadence, occurrences.length, amountSimilarity, isFixedHint),
    possibleZombie: latest.category === 'suscripciones' && confidence !== 'high',
  };
  const classification = isCommittedRecurringItem(baseItem) ? 'compromiso' : 'repeticion_variable';

  return {
    ...baseItem,
    occurrenceCount: sortedOccurrences.length,
    firstSeen: occurrences[0]?.date ?? latest.date,
    lastSeen: latest.date,
    classification,
    occurrenceIds: sortedOccurrences.map((transaction) => transaction.id),
  };
}

function isCommittedRecurringItem(
  item: Pick<RecurringExpenseItem, 'category' | 'merchant' | 'confidence' | 'cadence'>,
): boolean {
  const hasFixedSignal = fixedCategoryHints.has(item.category) || isFixedMerchant(item.merchant);

  if (!hasFixedSignal || item.confidence === 'low') {
    return false;
  }

  if (item.confidence === 'high') {
    return item.cadence === 'monthly';
  }

  return item.confidence === 'medium' && item.cadence !== 'irregular_repeat';
}

function getDateGaps(occurrences: readonly Transaction[]): number[] {
  const sortedOccurrences = [...occurrences].sort((a, b) => compareISODate(a.date, b.date));
  const gaps: number[] = [];

  for (let index = 1; index < sortedOccurrences.length; index += 1) {
    gaps.push(countInclusiveDays({ from: sortedOccurrences[index - 1].date, to: sortedOccurrences[index].date }) - 1);
  }

  return gaps;
}

function inferCadence(averageGap: number): RecurringCadence {
  if (averageGap >= 24 && averageGap <= 38) {
    return 'monthly';
  }

  if (averageGap >= 5 && averageGap <= 10) {
    return 'weekly';
  }

  return 'irregular_repeat';
}

function inferRecurringConfidence(
  cadence: RecurringCadence,
  amountSimilarity: number,
  isFixedHint: boolean,
  occurrences: number,
): Confidence {
  if (cadence === 'monthly' && amountSimilarity >= 0.9 && isFixedHint) {
    return 'high';
  }

  if ((cadence === 'monthly' && amountSimilarity >= 0.75) || (isFixedHint && occurrences >= 2)) {
    return 'medium';
  }

  return 'low';
}

function estimateMonthlyAmount(
  averageAmount: number,
  cadence: RecurringCadence,
  occurrences: readonly Transaction[],
): number {
  if (cadence === 'monthly') {
    return averageAmount;
  }

  if (cadence === 'weekly') {
    return Math.round(averageAmount * 4.345);
  }

  const period = getTransactionDateRange(occurrences);
  const days = Math.max(countInclusiveDays(period), 1);
  const observedTotal = sumTransactions(occurrences);
  return Math.round((observedTotal / days) * 30);
}

function buildRecurringReason(
  cadence: RecurringCadence,
  occurrences: number,
  amountSimilarity: number,
  isFixedHint: boolean,
): string {
  const cadenceLabel = cadence === 'monthly' ? 'monthly spacing' : cadence === 'weekly' ? 'weekly spacing' : 'repeated merchant';
  const amountLabel = amountSimilarity >= 0.9 ? 'very similar amounts' : 'some amount variation';
  const categoryLabel = isFixedHint ? 'fixed-cost category or merchant hint' : 'variable-spend merchant';

  return `${occurrences} occurrences with ${cadenceLabel}, ${amountLabel}, and ${categoryLabel}.`;
}

function calculateAmountSimilarity(amounts: readonly number[]): number {
  const max = Math.max(...amounts);
  const min = Math.min(...amounts);

  if (max === 0) {
    return 1;
  }

  return min / max;
}

function groupByMerchant(transactions: readonly Transaction[]): Map<string, Transaction[]> {
  const groups = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    groups.set(transaction.merchant, [...(groups.get(transaction.merchant) ?? []), transaction]);
  }

  return groups;
}

function getGroupKey(transaction: Transaction, groupBy: SummaryGroupBy | ComparisonGroupBy): string {
  switch (groupBy) {
    case 'category':
      return transaction.category;
    case 'merchant':
      return transaction.merchant;
    case 'day':
      return transaction.date;
    case 'week':
      return getISOWeekKey(transaction.date);
  }
}

function sortFoundTransactions(transactions: readonly Transaction[], sortBy: TransactionSortBy): Transaction[] {
  return [...transactions].sort((a, b) => {
    switch (sortBy) {
      case 'amount_asc':
        return a.amount - b.amount || sortTransactionsDescending(a, b);
      case 'amount_desc':
        return b.amount - a.amount || sortTransactionsDescending(a, b);
      case 'date_desc':
        return sortTransactionsDescending(a, b);
    }
  });
}

function buildFilterAssumptions(input: SummarizeSpendingInput): string[] {
  const assumptions = ['Amounts are positive ARS expenses from the mock dataset.'];

  if (!input.dateRange) {
    assumptions.push('No date range was provided, so the full dataset period was used.');
  }

  return assumptions;
}

function buildFiltersApplied(input: FindTransactionsInput): string[] {
  const filters: string[] = [];

  if (input.dateRange) {
    filters.push(`dateRange: ${input.dateRange.from} to ${input.dateRange.to}`);
  }

  if (input.categories?.length) {
    filters.push(`categories: ${input.categories.join(', ')}`);
  }

  if (input.merchants?.length) {
    filters.push(`merchants: ${input.merchants.join(', ')}`);
  }

  if (input.query) {
    filters.push(`query: ${input.query}`);
  }

  if (input.minAmount !== undefined) {
    filters.push(`minAmount: ${input.minAmount}`);
  }

  if (input.maxAmount !== undefined) {
    filters.push(`maxAmount: ${input.maxAmount}`);
  }

  return filters.length > 0 ? filters : ['none'];
}

function parseCategories(values?: Category[]): Category[] | undefined {
  if (!values) {
    return undefined;
  }

  return values.map((value) => categorySchema.parse(value));
}

function sumTransactions(transactions: readonly Transaction[]): number {
  return transactions.reduce((total, transaction) => total + transaction.amount, 0);
}

function calculatePercentDelta(deltaAmount: number, baselineTotal: number): number | null {
  if (baselineTotal === 0) {
    return null;
  }

  return roundToTwo((deltaAmount / baselineTotal) * 100);
}

function getDeltaDirection(deltaAmount: number): DeltaDirection {
  if (deltaAmount > 0) {
    return 'up';
  }

  if (deltaAmount < 0) {
    return 'down';
  }

  return 'flat';
}

function getForecastConfidence(elapsedDays: number, daysInMonth: number): Confidence {
  const observedShare = elapsedDays / daysInMonth;

  if (observedShare >= 0.66) {
    return 'high';
  }

  if (observedShare >= 0.2) {
    return 'medium';
  }

  return 'low';
}

function isFixedMerchant(merchant: string): boolean {
  return fixedMerchantHints.has(normalizeText(merchant));
}

function isForecastFixedMerchant(merchant: string): boolean {
  return forecastFixedMerchantHints.has(normalizeText(merchant));
}

function formatMonthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase('es-AR');
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
