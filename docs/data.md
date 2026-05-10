# Mock Transaction Data Spec

## Existing Data

The starter already includes `data/transactions.json` with 50 ARS expense transactions from 2026-03-15 through 2026-05-08. That satisfies the challenge count and approximate 60-day window.

For implementation, the data should be normalized to support stronger product insights. The main change should be category quality: rent should not live in `otros`, and groceries should be distinguishable from delivery or cafes.

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
    | "vivienda"
    | "servicios"
    | "suscripciones"
    | "supermercado"
    | "comida_fuera"
    | "transporte"
    | "salud"
    | "educacion"
    | "compras"
    | "ocio";
  description: string;
  merchant: string;
};
```

## Category Design

Target distribution for 50 transactions:

| Category | Count | Purpose |
|---|---:|---|
| `vivienda` | 2 | Monthly rent pattern |
| `servicios` | 8 | Electricity, gas, water, internet, phone |
| `suscripciones` | 6 | Netflix, Spotify, Disney+, app subscriptions |
| `supermercado` | 6 | Larger grocery trips |
| `comida_fuera` | 10 | Delivery, cafes, lunches, restaurants |
| `transporte` | 8 | SUBE, Uber, Cabify, fuel |
| `salud` | 4 | Pharmacy, gym, health plan |
| `educacion` | 3 | Courses and books |
| `compras` | 2 | Mercado Libre and electronics |
| `ocio` | 1 | Cinema or one-off leisure outside subscriptions |

The exact counts can move slightly, but the dataset needs recurring costs and flexible spending in balance.

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
