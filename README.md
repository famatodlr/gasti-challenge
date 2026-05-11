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
bun run test:tools
bun run verify:domain
bun run build
```

## Validation

Run these commands from `apps/ai` to validate the deterministic finance tools work:

```bash
bun run test:domain
bun run test:tools
bun run verify:domain
bun run build
```

The domain analytics tests and finance tool wrapper tests should pass, the domain verifier should print deterministic JSON output, and `bun run build` (`mastra build`) should produce the expected `.mastra/output` artifact.

### Mastra Dev Tooling Note

`bun run dev` from `apps/ai` and `bun run dev:ai` from the repo root currently fail under Bun with a Rollup `commonjs--resolver` read-only property error. This appears to be external Mastra/Bun/Rollup dev-mode tooling version skew, not a Gasti finance logic issue, and it does not block the deterministic finance tools work.

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
