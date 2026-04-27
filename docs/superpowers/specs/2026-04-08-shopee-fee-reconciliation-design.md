# Shopee Fee Reconciliation Tool — Design Spec

**Date:** 2026-04-08
**Project:** shopee-dashboard (new `/reconciliation` page)

---

## Context

As a Shopee local marketplace seller, platform fees are charged per order across multiple components (commission, transaction, service, AMS). Each month, the seller manually calculates expected fees from Shopee's published rate cards and reconciles them against the downloaded payout report (Income.released.my.YYYYMMDD_YYYYMMDD.xlsx) — a tedious, error-prone process at ~400 orders/month peak.

This spec defines a fee reconciliation screen added to the existing `shopee-dashboard` (Next.js + Supabase) that automates the calculation, comparison, and discrepancy tracking on an ongoing basis.

A companion `docs/shopee-fees-reference.md` will serve as the human-readable master reference for all Shopee Malaysia fee rules.

---

## Fee Structure Reference

All fees apply to **Local Marketplace sellers** (non-Shopee Mall). Fees are deducted from seller payout on order completion.

### Calculation Base

For Commission, Transaction, and Cashback Programme fees, the **base amount** is:

```
base = product_price − seller_product_discounts − seller_vouchers
```

### 1. Marketplace Commission Fee

- **Rate:** Configurable per product category (e.g. 11% pre-SST for Health & Beauty supplements)
- **Formula:** `ROUND(base × rate × 1.08, 2)` — standard 2dp rounding (verify ceiling vs round during implementation)
- **SST:** 8% added on top of base rate
- **Condition:** Only charged after seller has >100 completed orders OR >120 days since first listing
- **Cashback Programme participants** receive a lower commission rate (configured separately)
- **Source:** `lib/fee-config.ts`

### 2. Transaction Fee

- **Rate:** 3.5% pre-SST (= 3.78% incl. SST) for standard payment methods
- **Formula:** `ROUND(base × 0.035 × 1.08, 2)`
- **SST:** Included in the 3.78% figure
- **Installment plans:** Higher rates apply (SPayLater 1x = ~4.86%, SPayLater 3x = ~5.40%)
- **Source:** `lib/fee-config.ts`

### 3. Platform Support Fee

- **Rate:** RM0.54 per completed order (RM0.50 + 8% SST)
- **Formula:** Fixed flat fee — RM0.54
- **Exemptions:** New sellers (≤100 orders AND ≤120 days), essential food items, low-activity sellers (≤100 net orders/month OR ≤200 orders AND ≤RM3,000 GMV/month), FBS items, KPM textbooks
- **Source:** `lib/fee-config.ts`

### 4. Cashback Programme Service Fee _(if enrolled)_

- **Non-campaign rate:** 5.5% pre-SST (= 5.94% incl. SST), capped at RM108/item
- **Campaign day rate:** 7.5% pre-SST (= 8.10% incl. SST), capped at RM108/item
- **Campaign days:** Double-Digit days, Mid-month sales, Payday sales (8pm D-1 to 11:59pm D-day). Determined by matching `payout_date` against the `campaign_days` array in `fee-config.ts`
- **Formula:** `MIN(ROUND(base × rate × 1.08, 2), 108.00)`
- **Charged regardless of whether buyer used the cashback voucher**
- **Note:** The payout report's "Service Fee" column combines Platform Support + Cashback Programme. The "Service Fee Details" sheet splits them per order.
- **Source:** `lib/fee-config.ts`

### 5. AMS Commission Fee _(ads-attributed orders only)_

- **Rate:** Per-product rate set by seller via Shopee Ads, fetched from `v2.ams.get_open_campaign_added_product` API
- **Formula:** `base × ams_rate`
- **Caveat:** Rate is snapshotted at reconciliation time — if seller changed the rate mid-period, variance is expected and noted
- **Source:** AMS API (fetched at reconciliation time, stored as `ams_rate_used`)

### 6. Unsuccessful Order Fee _(returns/refunds only)_

- **FSF (Forward Shipping Fee):** Actual shipping fee − Shopee rebate, rounded up to 2dp
- **RSF (Return Shipping Fee):** Actual return shipping fee, rounded up to 2dp
- **SST:** 6% on FSF and RSF
- **Reconciliation:** Accept actuals from report — no formula to predict logistics costs

---

## Architecture

```
[Data Sources]
  ├── Shopee Income API (get_income_detail, chunked ≤14 days)   ← auto-fetch
  └── Payout XLSX upload (Income.released.my.YYYYMMDD_YYYYMMDD.xlsx) ← manual
         ↓
[Payout Parser — lib/payout-parser.ts]
  Normalises both sources into common per-order shape:
  order_sn, product_price, seller_voucher, payment_method,
  commission_actual, transaction_actual, platform_support_actual,
  cashback_actual, ams_actual, payout_date, is_campaign_day, ...
         ↓
[Fee Config — lib/fee-config.ts]
  TypeScript config file with all configurable rates:
  marketplace_commission_rate, cashback_enrolled, cashback_rates,
  transaction_rates_by_payment_method, platform_support_fee, tolerance
         ↓
[Reconciliation Engine — lib/reconciliation-engine.ts]
  Per order:
    1. Calculate expected fees using fee-config
    2. Fetch AMS rate from API (or use cached value)
    3. Diff expected vs actual per fee component
    4. Flag as discrepancy if |diff| > tolerance (default RM0.02)
         ↓
[Supabase Storage]
  payout_periods → payout_orders → recon_notes
         ↓
[/reconciliation page — app/reconciliation/page.tsx]
  Summary cards → order table with per-component E/A/Δ → drill-down + status tracking
```

---

## Fee Config File

**Path:** `lib/fee-config.ts`

```typescript
export const FEE_CONFIG = {
  // Marketplace commission — set to your product category rate (pre-SST)
  // e.g. Health & Beauty supplements = 11%
  marketplace_commission_rate: 0.11,

  // Set to true if enrolled in Shopee Cashback Programme
  cashback_enrolled: true,
  cashback_rate_non_campaign: 0.055, // 5.5% pre-SST
  cashback_rate_campaign: 0.075, // 7.5% pre-SST
  cashback_cap_incl_sst: 108.0, // RM108 per item

  // Platform support fee (RM0.54 incl. SST = RM0.50 + 8% SST)
  platform_support_fee: 0.54,

  // Transaction fee rates (pre-SST) by payment method
  transaction_fee_rates: {
    default: 0.035, // 3.5% for most methods
    SPayLater_1x: 0.045, // adjust to actual rate
    SPayLater_3x: 0.05, // adjust to actual rate
  },

  // SST rate applied on top of pre-SST fees
  sst_rate: 0.08,

  // Discrepancy tolerance — diffs below this are ignored (floating point noise)
  tolerance: 0.02,

  // Known Shopee campaign days for the current year (YYYY-MM-DD)
  // Used to determine whether cashback_rate_campaign or cashback_rate_non_campaign applies
  // Update at the start of each year with known double-digit, mid-month, and payday dates
  campaign_days: [
    '2026-01-01',
    '2026-02-02',
    '2026-03-03',
    '2026-04-04',
    '2026-05-05',
    '2026-06-06',
    '2026-07-07',
    '2026-08-08',
    '2026-09-09',
    '2026-10-10',
    '2026-11-11',
    '2026-12-12',
    // mid-month and payday dates — add as known
  ],
};
```

This file is updated manually when Shopee revises rates, alongside `docs/shopee-fees-reference.md`.

---

## Database Schema

New tables added to existing Supabase instance:

```sql
-- One row per reconciliation run
CREATE TABLE payout_periods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_from   date NOT NULL,
  period_to     date NOT NULL,
  source        text NOT NULL CHECK (source IN ('xlsx', 'api')),
  created_at    timestamptz DEFAULT now(),
  total_expected  numeric(10,2),
  total_actual    numeric(10,2),
  total_diff      numeric(10,2)
);

-- One row per order in a reconciliation run
CREATE TABLE payout_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id       uuid REFERENCES payout_periods(id) ON DELETE CASCADE,
  order_sn        text NOT NULL,
  payout_date     date,
  product_price   numeric(10,2),   -- base after seller discounts/vouchers
  payment_method  text,
  is_campaign_day boolean DEFAULT false,
  -- actuals from report/API
  commission_actual         numeric(10,2),
  transaction_actual        numeric(10,2),
  platform_support_actual   numeric(10,2),
  cashback_actual           numeric(10,2),
  ams_actual                numeric(10,2),
  -- expected from reconciliation engine
  commission_expected       numeric(10,2),
  transaction_expected      numeric(10,2),
  platform_support_expected numeric(10,2),
  cashback_expected         numeric(10,2),
  ams_expected              numeric(10,2),
  ams_rate_used             numeric(6,4),  -- snapshotted AMS rate
  -- summary
  total_diff      numeric(10,2),
  has_discrepancy boolean DEFAULT false
);

-- Status tracking for orders under investigation
CREATE TABLE recon_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_sn    text NOT NULL,
  period_id   uuid REFERENCES payout_periods(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'unreviewed'
                CHECK (status IN ('unreviewed', 'investigating', 'resolved')),
  notes       text,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (order_sn, period_id)
);

CREATE INDEX ON payout_orders(period_id);
CREATE INDEX ON payout_orders(has_discrepancy);
CREATE INDEX ON recon_notes(period_id, status);
```

---

## Payout XLSX Parser (`lib/payout-parser.ts`)

The payout report has three sheets:

| Sheet                   | Purpose                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| **Summary**             | Period metadata, high-level totals (used for cross-check)                 |
| **Income**              | Per-order + per-SKU rows. 3-row merged header. Primary data source.       |
| **Service Fee Details** | Per-order split of Service Fee into Cashback Programme + Platform Support |

**Parsing logic:**

1. Read **Summary** sheet — extract `period_from`, `period_to`, headline totals
2. Read **Income** sheet — skip rows 1–3 (headers), filter `View By === "Order"`, map 48 columns to normalised fields
3. Read **Service Fee Details** sheet — build map of `order_sn → { cashback_actual, platform_support_actual }`
4. Merge Service Fee Details into Income rows by `order_sn`
5. Return `PayoutPeriod` + `PayoutOrderRow[]`

Reuses the existing `xlsx` dependency already in `shopee-dashboard`.

---

## New Files

| Path                                      | Purpose                                                          |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `lib/fee-config.ts`                       | Configurable fee rates (single source of truth for calculations) |
| `lib/payout-parser.ts`                    | Parse payout XLSX into normalised shape                          |
| `lib/reconciliation-engine.ts`            | Apply fee config to actuals, compute diffs, flag discrepancies   |
| `app/reconciliation/page.tsx`             | Main reconciliation screen                                       |
| `app/api/reconciliation/upload/route.ts`  | XLSX upload → parse → store → return results                     |
| `app/api/reconciliation/fetch/route.ts`   | API auto-fetch path (Income API → parse → store → return)        |
| `app/api/reconciliation/periods/route.ts` | List past reconciliation runs                                    |
| `app/api/reconciliation/orders/route.ts`  | Fetch orders for a period (with filters)                         |
| `app/api/reconciliation/notes/route.ts`   | Update discrepancy status + notes                                |
| `supabase/reconciliation-schema.sql`      | New table definitions                                            |
| `docs/shopee-fees-reference.md`           | Master fee reference document                                    |

---

## Modified Files

| Path                              | Change                        |
| --------------------------------- | ----------------------------- |
| `components/Dashboard.tsx`        | Add "Reconciliation" nav link |
| `app/layout.tsx` or nav component | Add route to navigation       |

---

## UI Layout (`/reconciliation`)

### Controls

- Period selector (date range picker, same component as TimeFilter)
- **[Fetch via API]** button — auto-pulls from Shopee Income API
- **[Upload XLSX]** button — file input for payout report
- **[History]** — dropdown of previous reconciliation runs

### Summary Cards (4)

| Card                      | Value                                                        |
| ------------------------- | ------------------------------------------------------------ |
| Expected Fees             | Sum of all calculated expected fees                          |
| Actual Fees               | Sum of all reported actual fees                              |
| Total Discrepancy         | Diff (colour-coded: red = overcharged, green = undercharged) |
| Orders with Discrepancies | e.g. "2 / 68 orders"                                         |

### Order Table

Columns: Order ID · Payout Date · Comm. E/A/Δ · Trans. E/A/Δ · Platform E/A/Δ · Cashback E/A/Δ · AMS E/A/Δ · Status

- Rows with `has_discrepancy = true` highlighted amber
- Click any row → expand to show per-component breakdown + status actions
- Expanded row: `[Mark Investigating]` `[Mark Resolved]` `[Add Note]`
- Filter bar: All / Discrepancies Only / Investigating / Resolved

---

## Fee Reference Document

**Path:** `docs/shopee-fees-reference.md`

A standalone Markdown document covering all Shopee Malaysia fees for local marketplace sellers, including:

- All fee types with formulas, rates, bases, SST treatment
- Effective dates and change history
- Links to official Shopee Seller Education Hub articles
- Notes on exemptions and special cases

Updated alongside `lib/fee-config.ts` whenever Shopee revises rates.

---

## Verification

1. Upload `Income.released.my.20260401_20260408.xlsx` via the XLSX upload path
2. Confirm order count matches the number of "Order"-level rows in the Income sheet; confirm period Apr 1–8 detected from Summary sheet
3. Verify Commission for order `2604063YUH73T6`: expected = 64.60 × 11% × 1.08 = RM7.67 ✓
4. Verify Cashback for same order: expected = 64.60 × 5.5% × 1.08 = RM3.84 ✓
5. Verify Platform Support: RM0.54 ✓
6. Confirm Summary sheet totals match summed order totals (cross-check)
7. Confirm orders with `has_discrepancy = true` can be marked as Investigating with notes
8. Test API fetch path for a 14-day window; confirm chunking handles >14 day ranges
9. Confirm history view lists previous runs and allows switching between them
