# Challenge - Gasti

Conversational finance assistant challenge using local mock ARS transactions.

## Run Locally

```bash
bun install
bun run build
```

AI workspace:

```bash
cd apps/ai
bun run test:domain
bun run verify:domain
bun run build
bun run dev
```

From the repo root, `bun run dev:ai` starts the Mastra dev server for the AI workspace.

## Agent Tools

- `spendingSummaryTool`: totals and grouped spending breakdowns.
- `findTransactionsTool`: exact transaction rows for evidence and drilldowns.
- `comparePeriodsTool`: deterministic period-over-period comparisons.
- `detectRecurringExpensesTool`: repeated merchants, subscriptions, and fixed-cost signals.
- `forecastMonthEndSpendTool`: month-end spend projection from observed data.

Planned: wire these tools into the finance agent after the placeholder agent is replaced.

## Product Decisions So Far

- Deterministic analytics live in `apps/ai/src/mastra/domain`.
- Mastra tools are thin wrappers: load local data, call analytics, return structured output.
- Challenge data is local-only mock spending data in ARS from `data/transactions.json`.
- Raw transaction categories are preserved from the dataset. The domain layer normalizes them into 10 product categories for analytics and tool outputs: `vivienda`, `servicios`, `suscripciones`, `supermercado`, `comida_fuera`, `transporte`, `salud`, `educacion`, `compras`, and `ocio`.
- Transaction tool outputs include both normalized `category` and original `rawCategory`.

## Left For Later

- Replace the placeholder agent and register the tools on it.
- Add API and UI chat integration.
- Add Memory only if it helps the chat experience.
- Add Workflow only if there is a useful recurring review flow.
- Improve category labels and explanations when the agent is wired in.
