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
- No tool calls live APIs in the challenge version. Raw transaction data comes from `data/transactions.json`; structured user memory comes from `data/financial-memory.json`.
- The raw file keeps original broad categories. Tools expose normalized finance categories and keep the original value as `rawCategory` on transaction rows.
- Public tool inputs use flat date fields for LLM reliability. Date-bounded tools use top-level `from` and `to`; comparison tools use `currentFrom`, `currentTo`, `baselineFrom`, and `baselineTo`.

Shared schema sketches:

```ts
const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const rawCategorySchema = z.enum([
  "comida",
  "transporte",
  "salud",
  "otros",
  "entretenimiento",
  "servicios",
  "educacion",
]);

const categorySchema = z.enum([
  "vivienda",
  "servicios",
  "suscripciones",
  "supermercado",
  "comida_fuera",
  "delivery",
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
  rawCategory: rawCategorySchema,
  description: z.string(),
  merchant: z.string(),
});
```

## `getFinanceContext`

Purpose: expose deterministic metadata about the local ARS transaction dataset.

Why it exists: the agent needs a reliable reference for available dates, relative-date resolution, and month names without passing every transaction row into the prompt.

Input:

```ts
z.object({}).strict()
```

Output:

```ts
z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.literal("ARS"),
  availableDateRange: dateRangeSchema,
  availableMonths: z.array(z.object({
    year: z.number(),
    month: z.number(),
    label: z.string(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    transactionCount: z.number(),
  })),
})
```

Notes:

- `today` uses the configured demo reference date.
- `availableDateRange` is derived from the minimum and maximum transaction dates.
- `availableMonths` includes only months that have transactions.
- The tool must not return raw transaction rows.

## `getFinancialMemory`

Purpose: expose deterministic user-level financial context for the single demo resource.

Why it exists: transaction tools answer what happened in the mock ledger; financial memory answers what the user has explicitly told Gasti about income, goals, preferences, categories to watch, and confirmed recurring context. This is not generic RAG and does not use embeddings.

Input:

```ts
z.object({}).strict()
```

Output:

```ts
z.object({
  schemaVersion: z.literal(1),
  resourceId: z.literal("demo-user"),
  currency: z.literal("ARS"),
  knownIncome: z.array(z.object({
    label: z.string(),
    amount: z.number(),
    currency: z.literal("ARS"),
    cadence: z.enum(["monthly", "weekly", "biweekly", "one_time", "unknown"]),
    source: z.enum(["user_stated", "user_confirmed"]),
    notes: z.string().optional(),
  })),
  fixedExpenses: z.array(z.object({
    merchant: z.string(),
    category: categorySchema,
    amount: z.number(),
    currency: z.literal("ARS"),
    cadence: z.enum(["monthly", "weekly", "annual", "unknown"]),
    source: z.enum(["user_stated", "user_confirmed"]),
    notes: z.string().optional(),
  })),
  savingGoals: z.array(z.object({
    name: z.string(),
    targetAmount: z.number().optional(),
    currency: z.literal("ARS"),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    monthlyContributionTarget: z.number().optional(),
    source: z.enum(["user_stated", "user_confirmed"]),
    notes: z.string().optional(),
  })),
  watchCategories: z.array(categorySchema),
  recurringObservations: z.array(z.object({
    merchant: z.string(),
    category: categorySchema,
    observation: z.string(),
    preference: z.enum(["watch", "reduce", "keep"]),
    source: z.enum(["user_stated", "user_confirmed"]),
  })),
  preferences: z.object({
    preferredLanguage: z.enum(["es-AR", "en"]),
    answerStyle: z.enum(["concise", "detailed"]),
    includeEvidence: z.boolean(),
  }),
})
```

Notes:

- The current seed is intentionally sparse and uses empty arrays for facts the user has not supplied.
- The tool must not return raw transaction rows or transaction IDs.

## `updateFinancialMemory`

Purpose: persist explicit user-stated or user-confirmed financial facts for the single demo resource.

Why it exists: the chat API is stateless beyond the client-provided `messages[]`, so stable context such as income, saving goals, watch categories, confirmed fixed expenses, recurring observations, and response preferences needs an app-owned write path. This is structured JSON-backed financial memory, not Mastra Memory, not RAG, and not embeddings.

Input:

```ts
z.object({
  knownIncome: z.array(z.object({
    label: z.string().optional(),
    amount: z.number().int().positive(),
    currency: z.literal("ARS"),
    cadence: z.enum(["monthly", "weekly", "biweekly", "one_time", "unknown"]),
    source: z.enum(["user_stated", "user_confirmed"]),
    notes: z.string().optional(),
  }).strict()).optional(),
  fixedExpenses: z.array(z.object({
    merchant: z.string(),
    category: categorySchema,
    amount: z.number().int().positive(),
    currency: z.literal("ARS"),
    cadence: z.enum(["monthly", "weekly", "annual", "unknown"]),
    source: z.enum(["user_stated", "user_confirmed"]),
    notes: z.string().optional(),
  }).strict()).optional(),
  savingGoals: z.array(z.object({
    name: z.string(),
    targetAmount: z.number().int().positive().optional(),
    currency: z.literal("ARS"),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    monthlyContributionTarget: z.number().int().positive().optional(),
    source: z.enum(["user_stated", "user_confirmed"]),
    notes: z.string().optional(),
  }).strict()).optional(),
  watchCategories: z.array(categorySchema).optional(),
  recurringObservations: z.array(z.object({
    merchant: z.string(),
    category: categorySchema,
    observation: z.string(),
    preference: z.enum(["watch", "reduce", "keep"]),
    source: z.enum(["user_stated", "user_confirmed"]),
  }).strict()).optional(),
  preferences: z.object({
    preferredLanguage: z.enum(["es-AR", "en"]).optional(),
    answerStyle: z.enum(["concise", "detailed"]).optional(),
    includeEvidence: z.boolean().optional(),
  }).strict().optional(),
}).strict()
```

Output: the full `financialMemorySchema` after the merge.

Notes:

- The tool writes `data/financial-memory.json` with stable pretty JSON.
- The update function validates and merges only allowed structured fields; the model never writes arbitrary JSON.
- Missing monthly income labels default to `Ingreso mensual`.
- Saving goals can be stored before a target amount is known.
- Append-only arrays are deduplicated by stable keys, and watch categories are deduplicated by set membership.
- Patches with raw transaction rows, transaction IDs, secrets, API keys, sensitive bank data, unsupported fields, or unknown categories are rejected.
- The agent should not call this tool for facts inferred only from transaction analysis; it should wait for explicit user statement or confirmation.

## `spendingSummaryTool`

Purpose: answer aggregate questions like "cuanto gaste", "en que se me fue la plata", and "top categorias".

Why it exists: LLMs should not sum transaction rows in context. This tool gives reliable totals and grouped breakdowns.

Input:

```ts
z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categories: z.array(categorySchema).optional(),
  merchants: z.array(z.string()).optional(),
  groupBy: z.enum(["category", "merchant", "day", "week"]).default("category"),
  includeTopTransactions: z.boolean().default(true),
  topTransactionLimit: z.number().int().min(1).max(10).default(5),
}).strict()
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
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categories: z.array(categorySchema).optional(),
  merchants: z.array(z.string()).optional(),
  query: z.string().optional(),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  sortBy: z.enum(["date_desc", "amount_desc", "amount_asc"]).default("date_desc"),
  limit: z.number().int().min(1).max(25).default(10),
}).strict()
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
  currentFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currentTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  baselineFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  baselineTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  groupBy: z.enum(["category", "merchant"]).default("category"),
  categories: z.array(categorySchema).optional(),
}).strict()
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
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minOccurrences: z.number().int().min(2).max(4).default(2),
  includeVariableRecurring: z.boolean().default(true),
}).strict()
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
