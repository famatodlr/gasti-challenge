# Mock Transaction Data Spec

## Existing Data

The starter already includes `data/transactions.json` with 50 ARS expense transactions from 2026-03-15 through 2026-05-08. That satisfies the challenge count and approximate 60-day window.

The raw file keeps its original broad categories. Domain code normalizes them into product finance categories for analytics and tool outputs, so the raw dataset remains stable while user-facing summaries avoid broad buckets.

## Data Goals

- Feel like a real Argentine spending history.
- Be small enough for a challenge, around 50 rows.
- Cover roughly 60 days, with enough overlap to compare March/April/May.
- Include repeated merchants so recurring-expense detection is meaningful.
- Include variable spending patterns so the assistant can explain behavior, not just sum totals.
- Avoid live or sensitive data.

## File

`data/transactions.json`

## Schema

```ts
type Transaction = {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // positive expense amount in ARS pesos
  currency: "ARS";
  category:
    | "comida"
    | "transporte"
    | "salud"
    | "otros"
    | "entretenimiento"
    | "servicios"
    | "educacion";
  description: string;
  merchant: string;
};
```

## Normalized Domain Schema

Analytics use a normalized transaction shape:

```ts
type NormalizedTransaction = Omit<Transaction, "category"> & {
  category:
    | "vivienda"
    | "servicios"
    | "suscripciones"
    | "supermercado"
    | "comida_fuera"
    | "delivery"
    | "transporte"
    | "salud"
    | "educacion"
    | "compras"
    | "ocio";
  rawCategory: Transaction["category"];
};
```

## Category Design

Current raw distribution for 50 transactions:

| Raw category | Count | Notes |
|---|---:|---|
| `comida` | 13 | Groceries plus eating out in the source data |
| `transporte` | 8 | SUBE, rides, fuel |
| `salud` | 5 | Pharmacy, gym, health plan |
| `otros` | 7 | Rent, shopping, bank fee, one transfer |
| `entretenimiento` | 6 | Subscriptions and cinema |
| `servicios` | 8 | Utilities, phone, internet |
| `educacion` | 3 | Courses and books |

Current normalized distribution:

| Category | Count | Purpose |
|---|---:|---|
| `vivienda` | 2 | Monthly rent pattern |
| `servicios` | 9 | Electricity, gas, water, internet, phone, bank service fee |
| `suscripciones` | 5 | Netflix, Spotify, Disney+, app subscriptions |
| `supermercado` | 4 | Larger grocery trips |
| `comida_fuera` | 4 | Cafes, lunches, restaurants |
| `delivery` | 5 | Rappi and PedidosYa delivery |
| `transporte` | 8 | SUBE, Uber, Cabify, fuel |
| `salud` | 5 | Pharmacy, gym, health plan |
| `educacion` | 3 | Courses and books |
| `compras` | 3 | Mercado Libre and electronics |
| `ocio` | 2 | Cinema or one-off leisure outside subscriptions |

The normalization is intentionally small and deterministic. It is based on merchant/intent hints such as `Propietario` to `vivienda`, subscription merchants to `suscripciones`, supermarkets to `supermercado`, Rappi and PedidosYa to `delivery`, cafes/restaurants to `comida_fuera`, and `Mercado Libre` to `compras`.

## Realistic Merchant Set

Recurring or semi-recurring:

- `Propietario` for rent.
- `Edenor`, `Metrogas`, `AySA`, `Movistar`, `Personal`.
- `Netflix`, `Spotify`, `Disney+`.
- `Galeno`, `SportClub`.

Variable:

- `Coto`, `Carrefour`, `Jumbo`, `Dia`.
- `Rappi`, `PedidosYa`, `Starbucks`, `Havanna`, `McDonalds`.
- `SUBE`, `Uber`, `Cabify`, `YPF`, `Shell`.
- `Mercado Libre`, `Coderhouse`, `Platzi`, `Cuspide`, `Farmacity`.

## Intentional Signals for the Agent

### Recurring Commitments

Include at least two months of:

- Rent around ARS 250,000.
- Internet around ARS 16,500.
- Phone around ARS 18,900.
- Netflix around ARS 5,499.
- Spotify around ARS 3,499.
- Gym around ARS 22,000.

### Spend Drivers

Include a few obvious drivers:

- One large `compras` transaction, such as headphones from Mercado Libre.
- One `educacion` spike, such as a TypeScript course.
- Several delivery and cafe transactions clustered in early May.
- Fuel transactions that make transport meaningfully larger than only public transit.

### Forecast Behavior

For May, include transactions through around May 8 so month-end projection has partial-month data. This lets the agent say "with only eight days observed, confidence is medium" instead of pretending certainty.

### Recurring Detection Edge Cases

Include:

- High-confidence recurring merchants with two appearances.
- One entertainment subscription that appears once in the window, so the tool can label it lower confidence.
- Similar service amounts across months with small variation, such as electricity.

## Data Quality Rules

- IDs should be stable: `txn_001` through `txn_050`.
- Dates should be valid and sorted descending in the JSON for readability.
- Amounts should be integers, no cents.
- Descriptions should be short and natural.
- Do not include accents in category slugs.
- Keep merchant names consistent so recurring detection works.
- The dataset should not include income rows in the first version. If the user provides income, treat it as chat context or memory.
