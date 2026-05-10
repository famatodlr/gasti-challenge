# Mastra Tools Spec

## Tool Design Rules

All finance capabilities should be implemented as Mastra tools with `createTool({ id, description, inputSchema, outputSchema, execute })` and Zod schemas.

Shared conventions:

- Dates use `YYYY-MM-DD`.
- Date ranges are inclusive.
- Currency is always `ARS`.
- Amounts are positive integer pesos for expenses.
- Tool outputs include enough transaction IDs for the agent to cite evidence.
- Tools perform deterministic data work; the agent turns results into conversation.
- No tool calls live APIs in the challenge version. All data comes from `data/transactions.json`.

Shared schema sketches:

```ts
const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const categorySchema = z.enum([
  "vivienda",
  "servicios",
  "suscripciones",
  "supermercado",
  "comida_fuera",
  "transporte",
  "salud",
  "educacion",
  "compras",
  "ocio",
]);

const transactionSchema = z.object({
  id: z.string(),
  date: z.string(),
  amount: z.number(),
  currency: z.literal("ARS"),
  category: categorySchema,
  description: z.string(),
  merchant: z.string(),
});
```

## `spendingSummaryTool`

Purpose: answer aggregate questions like "cuanto gaste", "en que se me fue la plata", and "top categorias".

Why it exists: LLMs should not sum transaction rows in context. This tool gives reliable totals and grouped breakdowns.

Input:

```ts
z.object({
  dateRange: dateRangeSchema.optional(),
  categories: z.array(categorySchema).optional(),
  merchants: z.array(z.string()).optional(),
  groupBy: z.enum(["category", "merchant", "day", "week"]).default("category"),
  includeTopTransactions: z.boolean().default(true),
  topTransactionLimit: z.number().int().min(1).max(10).default(5),
})
```

Output:

```ts
z.object({
  period: dateRangeSchema,
  currency: z.literal("ARS"),
  total: z.number(),
  transactionCount: z.number(),
  groups: z.array(z.object({
    key: z.string(),
    label: z.string(),
    total: z.number(),
    count: z.number(),
    sharePct: z.number(),
    transactionIds: z.array(z.string()),
  })),
  topTransactions: z.array(transactionSchema),
  assumptions: z.array(z.string()),
})
```

## `findTransactionsTool`

Purpose: retrieve the exact transaction rows behind an answer.

Why it exists: the user will ask "mostrame", "cuales fueron", or "de donde sale ese numero". This tool keeps the agent auditable.

Input:

```ts
z.object({
  dateRange: dateRangeSchema.optional(),
  categories: z.array(categorySchema).optional(),
  merchants: z.array(z.string()).optional(),
  query: z.string().optional(),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  sortBy: z.enum(["date_desc", "amount_desc", "amount_asc"]).default("date_desc"),
  limit: z.number().int().min(1).max(25).default(10),
})
```

Output:

```ts
z.object({
  period: dateRangeSchema,
  currency: z.literal("ARS"),
  filtersApplied: z.array(z.string()),
  total: z.number(),
  transactionCount: z.number(),
  transactions: z.array(transactionSchema),
})
```

## `comparePeriodsTool`

Purpose: compare spending across two date ranges by total, category, or merchant.

Why it exists: period comparison is a core product behavior and should use deterministic math, not model reasoning.

Input:

```ts
z.object({
  currentRange: dateRangeSchema,
  baselineRange: dateRangeSchema,
  groupBy: z.enum(["category", "merchant"]).default("category"),
  categories: z.array(categorySchema).optional(),
})
```

Output:

```ts
z.object({
  currency: z.literal("ARS"),
  current: z.object({
    period: dateRangeSchema,
    total: z.number(),
    transactionCount: z.number(),
  }),
  baseline: z.object({
    period: dateRangeSchema,
    total: z.number(),
    transactionCount: z.number(),
  }),
  delta: z.object({
    amount: z.number(),
    percent: z.number().nullable(),
    direction: z.enum(["up", "down", "flat"]),
  }),
  groups: z.array(z.object({
    key: z.string(),
    label: z.string(),
    currentTotal: z.number(),
    baselineTotal: z.number(),
    deltaAmount: z.number(),
    deltaPercent: z.number().nullable(),
    driverTransactionIds: z.array(z.string()),
  })),
  caveats: z.array(z.string()),
})
```

## `detectRecurringExpensesTool`

Purpose: identify fixed costs, subscriptions, and repeated merchants.

Why it exists: this is the product's strongest "personal finance assistant" move. It turns a list of transactions into a practical understanding of committed monthly spend.

Input:

```ts
z.object({
  dateRange: dateRangeSchema.optional(),
  minOccurrences: z.number().int().min(2).max(4).default(2),
  includeVariableRecurring: z.boolean().default(true),
})
```

Output:

```ts
z.object({
  period: dateRangeSchema,
  currency: z.literal("ARS"),
  estimatedMonthlyCommittedSpend: z.number(),
  items: z.array(z.object({
    merchant: z.string(),
    category: categorySchema,
    cadence: z.enum(["monthly", "weekly", "irregular_repeat"]),
    latestAmount: z.number(),
    averageAmount: z.number(),
    estimatedMonthlyAmount: z.number(),
    occurrences: z.array(transactionSchema),
    confidence: z.enum(["high", "medium", "low"]),
    reason: z.string(),
    possibleZombie: z.boolean(),
  })),
  caveats: z.array(z.string()),
})
```

## `forecastMonthEndSpendTool`

Purpose: project where the current month is heading.

Why it exists: "a este ritmo" questions require repeatable assumptions. This tool makes the assumptions visible and keeps projection math outside the model.

Input:

```ts
z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  monthlyIncome: z.number().optional(),
  monthlyTargetSpend: z.number().optional(),
  excludeCategoriesFromDailyRunRate: z.array(categorySchema).default([
    "vivienda",
    "servicios",
    "suscripciones",
  ]),
})
```

Output:

```ts
z.object({
  periodObserved: dateRangeSchema,
  currency: z.literal("ARS"),
  observedSpend: z.number(),
  observedFixedSpend: z.number(),
  observedVariableSpend: z.number(),
  elapsedDays: z.number(),
  daysInMonth: z.number(),
  variableDailyAverage: z.number(),
  projectedVariableSpend: z.number(),
  projectedMonthEndSpend: z.number(),
  projectedRange: z.object({
    low: z.number(),
    high: z.number(),
  }),
  monthlyIncome: z.number().optional(),
  projectedSavingsOrDeficit: z.number().optional(),
  targetGap: z.number().optional(),
  assumptions: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
})
```

## Optional `monthlyReviewWorkflow`

This is not required for the base implementation. If there is time, create a Mastra workflow that runs the first four tools in a fixed sequence and exposes the workflow to the agent. Use it only for explicit review requests like:

- "Haceme un resumen del mes"
- "Dame un chequeo financiero rapido"
- "Que tendria que mirar esta semana?"

