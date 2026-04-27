# Shopee Fee Reconciliation Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/reconciliation` page to shopee-dashboard that accepts payout reports (XLSX upload or Shopee API auto-fetch), calculates expected fees from a rate config file, diffs them against actuals per order, stores results in Supabase, and allows tracking discrepancies to resolution.

**Architecture:** A `payout-parser` normalises both XLSX and API data into a common `PayoutOrderRow[]` shape. A `reconciliation-engine` applies `fee-config` rates to produce per-order expected fees and diffs. Results persist in three new Supabase tables (`payout_periods`, `payout_orders`, `recon_notes`). A new `/reconciliation` page with summary cards and a filterable order table surfaces discrepancies and allows status/notes updates.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (PostgreSQL), `xlsx` library (already installed), Tailwind CSS 4, Jest/ts-jest

**Spec:** `docs/superpowers/specs/2026-04-08-shopee-fee-reconciliation-design.md`

---

## File Map

| File                                              | Responsibility                                               |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `docs/shopee-fees-reference.md`                   | Human-readable master fee reference                          |
| `types/reconciliation.ts`                         | All TS interfaces for this feature                           |
| `lib/fee-config.ts`                               | Configurable fee rates — edit this when Shopee changes rates |
| `supabase/reconciliation-schema.sql`              | New table DDL                                                |
| `lib/payout-parser.ts`                            | XLSX → `PayoutOrderRow[]`; also normalises escrow API data   |
| `lib/reconciliation-engine.ts`                    | Expected fee calc + diff + discrepancy flag                  |
| `__tests__/lib/payout-parser.test.ts`             | Unit tests for parser                                        |
| `__tests__/lib/reconciliation-engine.test.ts`     | Unit tests for engine                                        |
| `app/api/reconciliation/upload/route.ts`          | POST XLSX → parse → store → return                           |
| `app/api/reconciliation/fetch/route.ts`           | POST date range → API pull → store → return                  |
| `app/api/reconciliation/periods/route.ts`         | GET list of past runs                                        |
| `app/api/reconciliation/orders/route.ts`          | GET orders for a period (with filters)                       |
| `app/api/reconciliation/notes/[orderSn]/route.ts` | PATCH status + notes                                         |
| `components/ReconciliationSummary.tsx`            | Four summary cards                                           |
| `components/ReconciliationTable.tsx`              | Order table with expandable rows                             |
| `app/reconciliation/page.tsx`                     | Main page — orchestrates all components                      |
| `components/Dashboard.tsx`                        | Add Reconciliation nav link _(modified)_                     |

---

## Task 1: Fee Reference Document

**Files:**

- Create: `docs/shopee-fees-reference.md`

- [ ] **Step 1: Create the fee reference document**

Create `docs/shopee-fees-reference.md` with the following content:

```markdown
# Shopee Malaysia Fee Reference — Local Marketplace Sellers

> Last updated: 2026-04-08
> Source articles: [3503](https://seller.shopee.com.my/edu/article/3503) · [6799](https://seller.shopee.com.my/edu/article/6799) · [1094](https://seller.shopee.com.my/edu/article/1094) · [16038](https://seller.shopee.com.my/edu/article/16038) · [5161](https://seller.shopee.com.my/edu/article/5161) · [25269](https://seller.shopee.com.my/edu/article/25269) · [1096](https://seller.shopee.com.my/edu/article/1096)
>
> **When Shopee changes a rate:** Update this document AND `lib/fee-config.ts` together.

---

## Calculation Base

For Commission, Transaction, and Cashback Programme fees:
```

base = product_price − seller_product_discounts − seller_vouchers

```

- `product_price` = deal price as listed (after seller item rebates)
- `seller_vouchers` = voucher amounts funded by seller (negative value in payout report)
- Shopee-sponsored discounts, coins, and payment channel promotions do NOT reduce the base

---

## 1. Marketplace Commission Fee

**Applies to:** All local Marketplace sellers (not Shopee Mall)
**When charged:** Per completed order. New sellers exempt until >100 completed orders OR >120 days since first listing (whichever comes first).

**Formula:**
```

commission = ROUND(base × commission_rate × 1.08, 2)

```

**Rate:** Varies by product category and Cashback Programme participation. Configured in `lib/fee-config.ts`.

| Category | Non-Cashback Rate (pre-SST) | Cashback Rate (pre-SST) |
|---|---|---|
| Health & Beauty / Supplements | ~11% | ~10.5% (verify with Seller Centre) |
| *(add other categories as needed)* | | |

**SST:** 8% added on top of the pre-SST rate.

**Effective date of current rate:** 1 February 2026

---

## 2. Transaction Fee

**Applies to:** All completed orders across Marketplace and Mall.

**Formula:**
```

transaction_fee = ROUND(base × rate_pre_sst × 1.08, 2)

```

**Rates (pre-SST):**

| Payment Method | Pre-SST Rate | Incl. SST |
|---|---|---|
| Online Banking | 3.50% | 3.78% |
| Credit / Debit Card | 3.50% | 3.78% |
| ShopeePay Balance | 3.50% | 3.78% |
| SPayLater (1x / Pay Later) | 4.50% | 4.86% |
| SPayLater (3x installment) | 5.00% | 5.40% |
| *(other methods)* | 3.50% | 3.78% |

**SST:** Included in the percentages above (already gross).

**Note:** The payout report includes a "Transaction Fee Rate (%)" column showing the inclusive rate used. Empirically, the base for calculation is the same as the commission base (not the "Amount Paid By Buyer" column, which can be reduced by payment channel promotions not reflected in the fee base).

---

## 3. Platform Support Fee

**Applies to:** All completed orders.
**Formula:** Fixed flat fee of **RM0.54 per order** (RM0.50 + 8% SST).
**Effective date:** 16 July 2025.

**Exemptions (fee deducted then reimbursed monthly):**
- New Marketplace sellers with ≤100 completed orders AND ≤120 days since first listing
- Essential food items (bread, flour, sugar, cooking oil, salt, rice, garlic, ginger, onion, poultry)
- Low-activity sellers: ≤100 net orders in last 30 days, OR ≤200 net orders AND ≤RM3,000 GMV in last 30 days
- Fulfilled by Shopee (FBS) items (until end of March 2026)
- Government textbooks under KPM Catalogue

---

## 4. Cashback Programme Service Fee *(optional — if seller is enrolled)*

**Applies to:** Sellers enrolled in the Shopee Cashback Programme, charged on all completed orders regardless of whether the buyer used the cashback voucher.

**Formula:**
```

cashback_fee = MIN(ROUND(base × rate × 1.08, 2), 108.00)

```

**Rates (pre-SST):**

| Day type | Pre-SST Rate | Incl. SST | Cap (incl. SST) |
|---|---|---|---|
| Non-campaign day | 5.5% | 5.94% | RM108.00/item |
| Campaign day | 7.5% | 8.10% | RM108.00/item |

**Campaign days:** Double-Digit days (1.1, 2.2, ... 12.12), Mid-month sales, Payday sales. Campaign period: 8pm on D-1 through 11:59pm on D-day.

**Note:** The payout report "Service Fee" column combines Platform Support Fee + Cashback Programme Fee. The "Service Fee Details" sheet shows the split per order.

**Activation:** Applications processed weekly (cut-off Tuesday 5PM, activated following Wednesday 12AM). Minimum 28-day commitment before opt-out.

---

## 5. AMS Commission Fee *(optional — ads-attributed orders only)*

**Applies to:** Orders attributed to Shopee Affiliate Marketing Solution (AMS) campaigns.

**Formula:**
```

ams_fee = ROUND(base × ams_rate, 2)

```

**Rate:** Set per product by the seller via Shopee Ads (typically 3–15%). Fetch current rates via:
- API: `GET /api/v2/ams/get_open_campaign_added_product` → `commission_rate` field per product

**Note:** The AMS rate snapshotted at reconciliation time may differ from the rate active when the order was placed. Rate-change variances are expected and logged.

---

## 6. Unsuccessful Order Fee *(returns/refunds only)*

**Applies to:** Orders that go through a refund or return & refund process (from 9 May 2022 onwards).

**Components:**
- **Forward Shipping Fee (FSF):** `CEIL(actual_shipping_fee − shopee_shipping_rebate, 2)` — charged when seller is at fault
- **Return Shipping Fee (RSF):** Actual return logistics cost — charged when physical return occurs

**SST:** 6% SST added on top of FSF and RSF.

**Not charged when:** Refund reason is Non-Receipt (outside seller's control).

**Reconciliation:** These fees cannot be predicted from a formula. Actuals are accepted from the payout report.

---

## Change Log

| Date | Change |
|---|---|
| 2026-04-08 | Initial document created |
| 2026-02-01 | Marketplace commission fee adjusted (Shopee update) |
| 2025-07-16 | Platform Support Fee introduced at RM0.54/order |
```

- [ ] **Step 2: Commit**

```bash
git add docs/shopee-fees-reference.md
git commit -m "docs: add Shopee Malaysia fee reference document"
```

---

## Task 2: Types

**Files:**

- Create: `types/reconciliation.ts`

- [ ] **Step 1: Create the types file**

Create `types/reconciliation.ts`:

```typescript
// Raw per-order row parsed from payout report (XLSX or API)
export interface PayoutOrderRow {
  order_sn: string;
  payout_date: string; // YYYY-MM-DD
  product_price: number; // after seller discounts/vouchers (commission base)
  payment_method: string; // e.g. "Online Banking", "SPayLater"
  payment_installment: string; // e.g. "1x", "3x" — relevant for SPayLater
  amount_paid_by_buyer: number;
  refund_amount: number;
  order_type: string;
  // actuals from report (positive values = absolute deduction amounts)
  commission_actual: number;
  transaction_actual: number;
  service_fee_actual: number; // combined: platform_support + cashback
  platform_support_actual: number; // from Service Fee Details sheet (XLSX) or estimated (API)
  cashback_actual: number; // derived: service_fee_actual - platform_support_actual
  ams_actual: number;
}

// Period metadata extracted from payout report Summary sheet
export interface PayoutPeriodMeta {
  period_from: string; // YYYY-MM-DD
  period_to: string; // YYYY-MM-DD
  total_released: number;
  total_fees: number;
}

// Per-order reconciliation result (extends actuals with expected + diffs)
export interface ReconOrderResult extends PayoutOrderRow {
  is_campaign_day: boolean;
  commission_expected: number;
  transaction_expected: number;
  platform_support_expected: number;
  cashback_expected: number;
  ams_expected: number;
  ams_rate_used: number;
  commission_diff: number; // actual - expected (positive = overcharged)
  transaction_diff: number;
  platform_support_diff: number;
  cashback_diff: number;
  ams_diff: number;
  total_diff: number;
  has_discrepancy: boolean;
}

// Stored payout period (from Supabase)
export interface PayoutPeriod {
  id: string;
  period_from: string;
  period_to: string;
  source: 'xlsx' | 'api';
  created_at: string;
  total_expected: number;
  total_actual: number;
  total_diff: number;
}

// Stored payout order (from Supabase)
export interface PayoutOrder extends ReconOrderResult {
  id: string;
  period_id: string;
  status: 'unreviewed' | 'investigating' | 'resolved';
  notes: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add types/reconciliation.ts
git commit -m "feat: add reconciliation TypeScript types"
```

---

## Task 3: Fee Config

**Files:**

- Create: `lib/fee-config.ts`

- [ ] **Step 1: Create the fee config file**

Create `lib/fee-config.ts`:

```typescript
/**
 * Shopee Malaysia fee rate configuration for reconciliation.
 *
 * UPDATE THIS FILE (alongside docs/shopee-fees-reference.md) whenever
 * Shopee revises rates.
 *
 * All rates are PRE-SST unless noted. SST (8%) is applied by the engine.
 * See docs/shopee-fees-reference.md for full formulas and context.
 */
export const FEE_CONFIG = {
  // ── Commission ───────────────────────────────────────────────────────────
  // Pre-SST commission rate for your product category.
  // Health & Beauty / Supplements: 11%
  // Find your rate at: https://seller.shopee.com.my/edu/article/6799
  marketplace_commission_rate: 0.11,

  // ── Cashback Programme ───────────────────────────────────────────────────
  // Set to true if your shop is enrolled in the Shopee Cashback Programme.
  cashback_enrolled: true,
  cashback_rate_non_campaign: 0.055, // 5.5% pre-SST
  cashback_rate_campaign: 0.075, // 7.5% pre-SST (Double-Digit, Mid-month, Payday)
  cashback_cap_incl_sst: 108.0, // RM108 per item (incl. SST)

  // ── Platform Support Fee ─────────────────────────────────────────────────
  // RM0.54 per completed order (RM0.50 + 8% SST). Flat fee.
  // Effective 16 July 2025.
  platform_support_fee: 0.54,

  // ── Transaction Fee ──────────────────────────────────────────────────────
  // Pre-SST rates by payment method.
  // SST is applied by the engine: effective_rate = rate × 1.08
  transaction_fee_rates: {
    default: 0.035, // 3.5% → 3.78% incl. SST
    SPayLater_1x: 0.045, // 4.5% → 4.86% incl. SST
    SPayLater_3x: 0.05, // 5.0% → 5.40% incl. SST
  } as Record<string, number>,

  // ── AMS Commission ───────────────────────────────────────────────────────
  // Default AMS rate. Overridden per-order if ams_rates map is provided.
  // Fetch current rates via: GET /api/v2/ams/get_open_campaign_added_product
  ams_commission_rate: 0.03, // 3% — update to match your Shopee Ads setting

  // ── SST ──────────────────────────────────────────────────────────────────
  sst_rate: 0.08, // 8% SST applied on top of all pre-SST fee rates

  // ── Reconciliation ───────────────────────────────────────────────────────
  // Differences smaller than this (in RM) are treated as floating-point noise.
  tolerance: 0.02,

  // ── Campaign Days ────────────────────────────────────────────────────────
  // Shopee campaign days for 2026 (YYYY-MM-DD).
  // Campaign period: 8pm D-1 through 11:59pm D-day.
  // Add mid-month and payday dates as they are announced.
  // Double-digit dates are fixed; others vary by campaign calendar.
  campaign_days: [
    // Double-digit days
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
    // Mid-month (add dates here as announced, e.g. '2026-04-15')
    // Payday (add dates here as announced, e.g. '2026-04-25')
  ],
} as const;

export type FeeConfig = typeof FEE_CONFIG;
```

- [ ] **Step 2: Commit**

```bash
git add lib/fee-config.ts
git commit -m "feat: add fee rate config file"
```

---

## Task 4: Database Schema

**Files:**

- Create: `supabase/reconciliation-schema.sql`

- [ ] **Step 1: Create the SQL file**

Create `supabase/reconciliation-schema.sql`:

```sql
-- Shopee Fee Reconciliation Tables
-- Run once against your Supabase project via the SQL editor or CLI.

-- One row per reconciliation run (a period + source combination)
CREATE TABLE IF NOT EXISTS payout_periods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_from   date NOT NULL,
  period_to     date NOT NULL,
  source        text NOT NULL CHECK (source IN ('xlsx', 'api')),
  created_at    timestamptz DEFAULT now(),
  total_expected  numeric(10,2),
  total_actual    numeric(10,2),
  total_diff      numeric(10,2)
);

-- One row per order within a reconciliation run
CREATE TABLE IF NOT EXISTS payout_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id       uuid NOT NULL REFERENCES payout_periods(id) ON DELETE CASCADE,
  order_sn        text NOT NULL,
  payout_date     date,
  product_price   numeric(10,2),    -- base = product_price after seller discounts/vouchers
  payment_method  text,
  payment_installment text,
  is_campaign_day boolean DEFAULT false,
  -- actuals (positive values = absolute fee amounts)
  commission_actual         numeric(10,2),
  transaction_actual        numeric(10,2),
  platform_support_actual   numeric(10,2),
  cashback_actual           numeric(10,2),
  ams_actual                numeric(10,2),
  -- expected (calculated by reconciliation engine)
  commission_expected       numeric(10,2),
  transaction_expected      numeric(10,2),
  platform_support_expected numeric(10,2),
  cashback_expected         numeric(10,2),
  ams_expected              numeric(10,2),
  ams_rate_used             numeric(6,4),   -- AMS rate snapshot at reconciliation time
  -- diffs (actual - expected; positive = overcharged)
  commission_diff           numeric(10,2),
  transaction_diff          numeric(10,2),
  platform_support_diff     numeric(10,2),
  cashback_diff             numeric(10,2),
  ams_diff                  numeric(10,2),
  total_diff                numeric(10,2),
  has_discrepancy           boolean DEFAULT false
);

-- Discrepancy status tracking (one row per order under investigation)
CREATE TABLE IF NOT EXISTS recon_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_sn    text NOT NULL,
  period_id   uuid NOT NULL REFERENCES payout_periods(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'unreviewed'
                CHECK (status IN ('unreviewed', 'investigating', 'resolved')),
  notes       text,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (order_sn, period_id)
);

CREATE INDEX IF NOT EXISTS idx_payout_orders_period   ON payout_orders(period_id);
CREATE INDEX IF NOT EXISTS idx_payout_orders_discr    ON payout_orders(has_discrepancy);
CREATE INDEX IF NOT EXISTS idx_recon_notes_period     ON recon_notes(period_id, status);
```

- [ ] **Step 2: Run the SQL against your Supabase project**

In the Supabase dashboard → SQL Editor, paste and run `supabase/reconciliation-schema.sql`.

Verify the three tables appear in Table Editor: `payout_periods`, `payout_orders`, `recon_notes`.

- [ ] **Step 3: Commit**

```bash
git add supabase/reconciliation-schema.sql
git commit -m "feat: add reconciliation database schema"
```

---

## Task 5: Payout Parser — Tests

**Files:**

- Create: `__tests__/lib/payout-parser.test.ts`

The parser needs to handle the payout XLSX with its 3-row merged header in the Income sheet and join the Service Fee Details sheet. We test the normalised output, not internal details.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/payout-parser.test.ts`:

```typescript
import * as xlsx from 'xlsx';
import { parsePayout } from '@/lib/payout-parser';
import type { PayoutOrderRow, PayoutPeriodMeta } from '@/types/reconciliation';

// Build a minimal in-memory XLSX buffer with the same structure as a real payout report
function buildTestXlsx(): Buffer {
  const wb = xlsx.utils.book_new();

  // Summary sheet — rows match actual report structure
  const summaryData = [
    ['Income Report', '', '', ''],
    ['', '', '', ''],
    ['', '', '', ''],
    ['', '', '', ''],
    ['Report Details', '', '', ''],
    ['Username (Seller)', 'test_seller', '', ''],
    ['Bank Account Name', 'Test Sdn Bhd', '', ''],
    ['Bank Account', '****1234', '', ''],
    ['Bank Name', 'MAYBANK', '', ''],
    ['From', '2026-04-01', '', ''],
    ['to', '2026-04-08', '', ''],
    ['', '', '', ''],
    ['Income Summary', '', '', 'RM'],
    ['1. Total Revenue', '', '', 6458.77],
    ['', '', '', ''],
    ['2. Total Expenses', '', '', -1503.87],
    ['', '', '', ''],
    ['3. Total Released Amount', '', '', 4954.9],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(summaryData), 'Summary');

  // Income sheet — 3-row header + 2 order rows (1 Order-level, 1 Sku-level)
  const incomeData = [
    // Row 1: group headers
    [
      'Order Info',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Released Amount Details',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Buyer Info',
      '',
      '',
      '',
      '',
      '',
      'Reference Info',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
    // Row 2: sub-group headers
    [
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Order Income',
      'Merchandise Subtotal',
      '',
      'Shipping Subtotal',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Vouchers and Rebates',
      '',
      '',
      '',
      '',
      'Fees and Charges',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Shipping',
      '',
      '',
      'Promotion',
      'Compensation',
      'Refund Amount Breakdown',
      '',
      '',
      '',
      '',
    ],
    // Row 3: column names
    [
      'Sequence No.',
      'View By',
      'Order ID',
      'refund id',
      'Product ID',
      'Product Name',
      'Order Creation Date',
      'Payout Completed Date',
      'Release Channel',
      'Order Type',
      'Hot Listing',
      'Total Released Amount (RM)',
      'Product Price',
      'Refund Amount',
      'Shipping Fee Paid by Buyer (excl. SST)',
      'Shipping Fee Charged by Logistic Provider',
      'Seller Paid Shipping Fee SST',
      'Shipping Rebate From Shopee',
      'Reverse Shipping Fee',
      'Reverse Shipping Fee SST',
      'Saver Programme Shipping Fee Savings',
      'Return to Seller Fee',
      'Rebate Provided by Shopee',
      'Voucher Sponsored by Seller',
      'Cofund Voucher Sponsored by Seller',
      'Coin Cashback Sponsored by Seller',
      'Cofund Coin Cashback Sponsored by Seller',
      'Commission Fee (incl. SST)',
      'Service Fee (Incl. SST)',
      'Transaction Fee (Incl. SST)',
      'AMS Commission Fee',
      'Saver Programme Fee (Incl. SST)',
      'Ads Escrow Top Up Fee',
      'Username (Buyer)',
      'Amount Paid By Buyer',
      'Transaction Fee Rate (%)',
      'Buyer Payment Method',
      'Buyer Payment Method Details_1(if applicable)',
      'Payment Details / Installment Plan',
      'Shipping Fee Promotion by Seller',
      'Shipping provider',
      'Courier Name',
      'Voucher Code From Seller',
      'Lost Compensation',
      'Cash refund to buyer amount',
      'Pro-rated coin offset for return refund Items',
      'Pro-rated Shopee voucher offset for returned items',
      'Pro-rated Bank Payment Channel Promotion  for return refund Items',
      'Pro-rated Shopee Payment Channel Promotion  for return refund Items',
    ],
    // Row 4: Order-level row
    [
      1,
      'Order',
      'TEST001',
      '',
      '-',
      '-',
      '2026-04-06',
      '2026-04-08',
      'Seller Wallet',
      'Normal Order',
      'NO',
      50.11,
      64.6,
      0,
      0,
      -4.9,
      0,
      4.9,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      -7.67,
      -4.38,
      -2.44,
      0,
      '0.00',
      0,
      'buyer1',
      61.37,
      3.78,
      'Online Banking',
      '',
      '',
      '0.00',
      '2-Day Delivery',
      'SPX Express (2DD)',
      '',
      '0.00',
      '0.00',
      '0.00',
      '0.00',
      '0.00',
      '0.00',
    ],
    // Row 5: Sku-level row — should be IGNORED by parser
    [
      2,
      'Sku',
      'TEST001',
      '-',
      '123456',
      'Test Product',
      '2026-04-06',
      '2026-04-08',
      'Seller Wallet',
      'Normal Order',
      'NO',
      50.11,
      64.6,
      0,
      0,
      -4.9,
      0,
      4.9,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      -7.67,
      -4.38,
      -2.44,
      0,
      '-',
      0,
      '',
      '-',
      '-',
      'Online Banking',
      '',
      '-',
      '-',
      '2-Day Delivery',
      'SPX Express (2DD)',
      '',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
    ],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(incomeData), 'Income');

  // Service Fee Details sheet
  const serviceFeeData = [
    ['', '', 'Service Fee (Incl. SST)', ''],
    ['Sequence No.', 'Order ID', 'Cashback Programme', 'Platform Support Fee'],
    [1, 'TEST001', -3.84, -0.54],
  ];
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(serviceFeeData), 'Service Fee Details');

  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('parsePayout()', () => {
  let buffer: Buffer;
  let result: { meta: PayoutPeriodMeta; orders: PayoutOrderRow[] };

  beforeAll(() => {
    buffer = buildTestXlsx();
    result = parsePayout(buffer);
  });

  describe('period metadata', () => {
    it('extracts period_from from Summary sheet', () => {
      expect(result.meta.period_from).toBe('2026-04-01');
    });

    it('extracts period_to from Summary sheet', () => {
      expect(result.meta.period_to).toBe('2026-04-08');
    });

    it('extracts total_released from Summary sheet', () => {
      expect(result.meta.total_released).toBe(4954.9);
    });
  });

  describe('order parsing', () => {
    it('returns exactly one order (Sku rows are excluded)', () => {
      expect(result.orders).toHaveLength(1);
    });

    it('maps order_sn correctly', () => {
      expect(result.orders[0].order_sn).toBe('TEST001');
    });

    it('maps payout_date from Payout Completed Date', () => {
      expect(result.orders[0].payout_date).toBe('2026-04-08');
    });

    it('maps product_price correctly', () => {
      expect(result.orders[0].product_price).toBe(64.6);
    });

    it('maps payment_method correctly', () => {
      expect(result.orders[0].payment_method).toBe('Online Banking');
    });

    it('maps commission_actual as positive absolute value', () => {
      expect(result.orders[0].commission_actual).toBe(7.67);
    });

    it('maps transaction_actual as positive absolute value', () => {
      expect(result.orders[0].transaction_actual).toBe(2.44);
    });

    it('maps service_fee_actual as positive absolute value', () => {
      expect(result.orders[0].service_fee_actual).toBe(4.38);
    });
  });

  describe('Service Fee Details join', () => {
    it('sets platform_support_actual from Service Fee Details sheet', () => {
      expect(result.orders[0].platform_support_actual).toBe(0.54);
    });

    it('derives cashback_actual as service_fee_actual - platform_support_actual', () => {
      expect(result.orders[0].cashback_actual).toBeCloseTo(3.84, 2);
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
cd "C:\Users\Justin Yow\Claude Code\shopee-dashboard"
npx jest __tests__/lib/payout-parser.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/payout-parser'`

---

## Task 6: Payout Parser — Implementation

**Files:**

- Create: `lib/payout-parser.ts`

- [ ] **Step 1: Implement the parser**

Create `lib/payout-parser.ts`:

```typescript
import * as xlsx from 'xlsx';
import type { PayoutOrderRow, PayoutPeriodMeta } from '@/types/reconciliation';

// Income sheet column indices (0-based), row 3 = header
const COL = {
  VIEW_BY: 1,
  ORDER_ID: 2,
  PAYOUT_DATE: 7,
  PRODUCT_PRICE: 12,
  REFUND_AMOUNT: 13,
  VOUCHER_FROM_SELLER: 23,
  COMMISSION_FEE: 27,
  SERVICE_FEE: 28,
  TRANSACTION_FEE: 29,
  AMS_FEE: 30,
  AMOUNT_PAID_BUYER: 34,
  TXN_RATE: 35,
  PAYMENT_METHOD: 36,
  INSTALLMENT_PLAN: 38,
  ORDER_TYPE: 9,
} as const;

function toNum(val: unknown): number {
  if (val === null || val === undefined || val === '' || val === '-') return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function toStr(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function toDateStr(val: unknown): string {
  const s = toStr(val);
  if (!s) return '';
  // Format can be "2026-04-08" or numeric serial
  if (typeof val === 'number') {
    // Excel serial date → JS Date
    const d = xlsx.SSF.parse_date_code(val as number);
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  // Already a string — take the date part only (first 10 chars)
  return s.substring(0, 10);
}

function parseSummarySheet(ws: xlsx.WorkSheet): PayoutPeriodMeta {
  const rows = xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];

  let period_from = '';
  let period_to = '';
  let total_released = 0;
  let total_fees = 0;

  for (const row of rows) {
    const label = toStr(row[0]).toLowerCase();
    if (label === 'from') period_from = toStr(row[1]);
    if (label === 'to') period_to = toStr(row[1]);
    if (label === '3. total released amount') total_released = toNum(row[3]);
    if (label === '2. total expenses') total_fees = Math.abs(toNum(row[3]));
  }

  return { period_from, period_to, total_released, total_fees };
}

function parseServiceFeeDetails(
  ws: xlsx.WorkSheet,
): Map<string, { cashback: number; platform: number }> {
  // Rows: 0=group header, 1=column names, 2+ = data
  const rows = xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
  const map = new Map<string, { cashback: number; platform: number }>();

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    const orderSn = toStr(row[1]);
    if (!orderSn) continue;
    map.set(orderSn, {
      cashback: Math.abs(toNum(row[2])),
      platform: Math.abs(toNum(row[3])),
    });
  }

  return map;
}

function parseIncomeSheet(
  ws: xlsx.WorkSheet,
  serviceFees: Map<string, { cashback: number; platform: number }>,
): PayoutOrderRow[] {
  // Rows 0-2 are the 3-row merged header; data starts at row 3
  const rows = xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
  const orders: PayoutOrderRow[] = [];

  for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    if (toStr(row[COL.VIEW_BY]) !== 'Order') continue;

    const order_sn = toStr(row[COL.ORDER_ID]);
    if (!order_sn || order_sn === '-') continue;

    const service_fee_actual = Math.abs(toNum(row[COL.SERVICE_FEE]));
    const sf = serviceFees.get(order_sn);
    const platform_support_actual = sf ? sf.platform : service_fee_actual > 0 ? 0.54 : 0;
    const cashback_actual = Math.max(0, +(service_fee_actual - platform_support_actual).toFixed(2));

    orders.push({
      order_sn,
      payout_date: toDateStr(row[COL.PAYOUT_DATE]),
      product_price:
        toNum(row[COL.PRODUCT_PRICE]) + Math.abs(toNum(row[COL.VOUCHER_FROM_SELLER])) === 0
          ? toNum(row[COL.PRODUCT_PRICE])
          : toNum(row[COL.PRODUCT_PRICE]) + toNum(row[COL.VOUCHER_FROM_SELLER]),
      // product_price in payout report is the deal price; voucher is already deducted from it
      // so the commission base = product_price (the report's "Product Price" column already
      // reflects the price after seller item rebates, and vouchers are separate deductions)
      payment_method: toStr(row[COL.PAYMENT_METHOD]),
      payment_installment: toStr(row[COL.INSTALLMENT_PLAN]),
      amount_paid_by_buyer: toNum(row[COL.AMOUNT_PAID_BUYER]),
      refund_amount: Math.abs(toNum(row[COL.REFUND_AMOUNT])),
      order_type: toStr(row[COL.ORDER_TYPE]),
      commission_actual: Math.abs(toNum(row[COL.COMMISSION_FEE])),
      transaction_actual: Math.abs(toNum(row[COL.TRANSACTION_FEE])),
      service_fee_actual,
      platform_support_actual,
      cashback_actual,
      ams_actual: Math.abs(toNum(row[COL.AMS_FEE])),
    });
  }

  return orders;
}

/**
 * Parse a Shopee payout report XLSX buffer.
 * Returns period metadata from the Summary sheet and normalised per-order rows
 * with Service Fee components joined from the Service Fee Details sheet.
 */
export function parsePayout(buffer: Buffer): { meta: PayoutPeriodMeta; orders: PayoutOrderRow[] } {
  const wb = xlsx.read(buffer, { type: 'buffer' });

  const summarySheet = wb.Sheets['Summary'];
  const incomeSheet = wb.Sheets['Income'];
  const serviceFeeSheet = wb.Sheets['Service Fee Details'];

  if (!summarySheet || !incomeSheet) {
    throw new Error('Invalid payout report: missing Summary or Income sheet');
  }

  const meta = parseSummarySheet(summarySheet);
  const serviceFees = serviceFeeSheet ? parseServiceFeeDetails(serviceFeeSheet) : new Map();
  const orders = parseIncomeSheet(incomeSheet, serviceFees);

  return { meta, orders };
}

/**
 * Normalise a single order's escrow API response into PayoutOrderRow shape.
 * Used by the API auto-fetch path (get_escrow_detail_batch response).
 * Note: escrow API does not split service_fee into platform_support + cashback;
 * platform_support_actual defaults to 0.54 (standard flat fee).
 */
export function normaliseEscrowOrder(escrow: {
  order_sn: string;
  release_time?: number;
  buyer_total_amount: number;
  commission_fee: number;
  service_fee: number;
  seller_transaction_fee: number;
  ams_commission_fee?: number;
  voucher_from_seller?: number;
  original_cost_of_goods_sold?: number;
  payment_method?: string;
}): PayoutOrderRow {
  const service_fee_actual = Math.abs(escrow.service_fee ?? 0);
  const platform_support_actual = 0.54; // API path cannot split service fee
  const cashback_actual = Math.max(0, +(service_fee_actual - platform_support_actual).toFixed(2));

  const payoutDate = escrow.release_time
    ? new Date(escrow.release_time * 1000).toISOString().substring(0, 10)
    : '';

  return {
    order_sn: escrow.order_sn,
    payout_date: payoutDate,
    product_price: escrow.original_cost_of_goods_sold ?? escrow.buyer_total_amount,
    payment_method: escrow.payment_method ?? '',
    payment_installment: '',
    amount_paid_by_buyer: escrow.buyer_total_amount,
    refund_amount: 0,
    order_type: 'Normal Order',
    commission_actual: Math.abs(escrow.commission_fee ?? 0),
    transaction_actual: Math.abs(escrow.seller_transaction_fee ?? 0),
    service_fee_actual,
    platform_support_actual,
    cashback_actual,
    ams_actual: Math.abs(escrow.ams_commission_fee ?? 0),
  };
}
```

- [ ] **Step 2: Fix the product_price mapping**

The product_price calculation above has a bug in the ternary. Replace lines setting `product_price` with this simpler version:

```typescript
      // Commission base = Product Price column (deal price after seller item rebates)
      // Seller vouchers are already reflected in Product Price in the payout report
      product_price: toNum(row[COL.PRODUCT_PRICE]),
```

Replace the multi-line `product_price:` entry with:

```typescript
      product_price:        toNum(row[COL.PRODUCT_PRICE]),
```

- [ ] **Step 3: Run tests and confirm they pass**

```bash
npx jest __tests__/lib/payout-parser.test.ts --no-coverage
```

Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add lib/payout-parser.ts __tests__/lib/payout-parser.test.ts
git commit -m "feat: add payout report XLSX parser with tests"
```

---

## Task 7: Reconciliation Engine — Tests

**Files:**

- Create: `__tests__/lib/reconciliation-engine.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/reconciliation-engine.test.ts`:

```typescript
import { reconcileOrders } from '@/lib/reconciliation-engine';
import { FEE_CONFIG } from '@/lib/fee-config';
import type { PayoutOrderRow, ReconOrderResult } from '@/types/reconciliation';

// Standard non-campaign order matching real payout report data
const baseOrder: PayoutOrderRow = {
  order_sn: 'TEST001',
  payout_date: '2026-04-06', // not a campaign day in FEE_CONFIG
  product_price: 64.6,
  payment_method: 'Online Banking',
  payment_installment: '',
  amount_paid_by_buyer: 61.37,
  refund_amount: 0,
  order_type: 'Normal Order',
  commission_actual: 7.67,
  transaction_actual: 2.44,
  service_fee_actual: 4.38,
  platform_support_actual: 0.54,
  cashback_actual: 3.84,
  ams_actual: 0,
};

describe('reconcileOrders()', () => {
  let results: ReconOrderResult[];

  beforeAll(() => {
    results = reconcileOrders([baseOrder], FEE_CONFIG);
  });

  it('returns one result per input order', () => {
    expect(results).toHaveLength(1);
  });

  it('is_campaign_day is false for a non-campaign date', () => {
    expect(results[0].is_campaign_day).toBe(false);
  });

  describe('commission', () => {
    it('calculates commission_expected = 64.60 × 11% × 1.08 = 7.67', () => {
      expect(results[0].commission_expected).toBe(7.67);
    });

    it('commission_diff is 0.00 (no discrepancy)', () => {
      expect(results[0].commission_diff).toBe(0.0);
    });
  });

  describe('transaction fee', () => {
    it('calculates transaction_expected = 64.60 × 3.5% × 1.08 = 2.44', () => {
      expect(results[0].transaction_expected).toBe(2.44);
    });

    it('transaction_diff is 0.00', () => {
      expect(results[0].transaction_diff).toBe(0.0);
    });
  });

  describe('platform support fee', () => {
    it('platform_support_expected = 0.54 (flat fee)', () => {
      expect(results[0].platform_support_expected).toBe(0.54);
    });

    it('platform_support_diff is 0.00', () => {
      expect(results[0].platform_support_diff).toBe(0.0);
    });
  });

  describe('cashback programme fee', () => {
    it('cashback_expected = 64.60 × 5.5% × 1.08 = 3.84 on non-campaign day', () => {
      expect(results[0].cashback_expected).toBe(3.84);
    });

    it('cashback_diff is 0.00', () => {
      expect(results[0].cashback_diff).toBe(0.0);
    });
  });

  describe('discrepancy detection', () => {
    it('has_discrepancy is false when all diffs are within tolerance', () => {
      expect(results[0].has_discrepancy).toBe(false);
    });

    it('has_discrepancy is true when commission diff exceeds tolerance', () => {
      const overchargedOrder: PayoutOrderRow = { ...baseOrder, commission_actual: 8.5 };
      const [r] = reconcileOrders([overchargedOrder], FEE_CONFIG);
      expect(r.has_discrepancy).toBe(true);
      expect(r.commission_diff).toBeCloseTo(0.83, 2);
    });
  });

  describe('campaign day', () => {
    it('uses cashback_rate_campaign on a campaign day', () => {
      const campaignOrder: PayoutOrderRow = { ...baseOrder, payout_date: '2026-04-04' }; // 4.4 double-digit
      const [r] = reconcileOrders([campaignOrder], FEE_CONFIG);
      expect(r.is_campaign_day).toBe(true);
      // 64.60 × 7.5% × 1.08 = 5.23
      expect(r.cashback_expected).toBe(5.23);
    });
  });

  describe('SPayLater installment rates', () => {
    it('applies SPayLater_3x rate for 3x installments', () => {
      const splayOrder: PayoutOrderRow = {
        ...baseOrder,
        payment_method: 'SPayLater',
        payment_installment: '3x',
        transaction_actual: 3.49,
      };
      const [r] = reconcileOrders([splayOrder], FEE_CONFIG);
      // 64.60 × 5.0% × 1.08 = 3.49
      expect(r.transaction_expected).toBe(3.49);
    });
  });

  describe('AMS commission', () => {
    it('calculates ams_expected when ams_actual > 0 and ams rate provided', () => {
      const amsOrder: PayoutOrderRow = { ...baseOrder, ams_actual: 1.94 };
      const amsRates = new Map([['TEST001', 0.03]]);
      const [r] = reconcileOrders([amsOrder], FEE_CONFIG, amsRates);
      // 64.60 × 3% = 1.94
      expect(r.ams_expected).toBe(1.94);
      expect(r.ams_rate_used).toBe(0.03);
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npx jest __tests__/lib/reconciliation-engine.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/reconciliation-engine'`

---

## Task 8: Reconciliation Engine — Implementation

**Files:**

- Create: `lib/reconciliation-engine.ts`

- [ ] **Step 1: Implement the engine**

Create `lib/reconciliation-engine.ts`:

```typescript
import type { PayoutOrderRow, ReconOrderResult } from '@/types/reconciliation';
import type { FeeConfig } from '@/lib/fee-config';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getTransactionRate(paymentMethod: string, installment: string, config: FeeConfig): number {
  if (paymentMethod === 'SPayLater') {
    const key = `SPayLater_${installment || '1x'}`;
    if (key in config.transaction_fee_rates) {
      return config.transaction_fee_rates[key];
    }
  }
  return config.transaction_fee_rates['default'] ?? 0.035;
}

/**
 * Calculate expected fees for a list of payout orders using the fee config.
 * Returns a ReconOrderResult per order with expected fees, diffs, and discrepancy flag.
 *
 * @param orders    - Normalised payout order rows (actuals from report/API)
 * @param config    - Fee rate configuration from lib/fee-config.ts
 * @param amsRates  - Optional map of order_sn → AMS commission rate (from AMS API)
 */
export function reconcileOrders(
  orders: PayoutOrderRow[],
  config: FeeConfig,
  amsRates: Map<string, number> = new Map(),
): ReconOrderResult[] {
  return orders.map((order) => {
    const base = order.product_price;
    const isCampaign = (config.campaign_days as readonly string[]).includes(order.payout_date);
    const sst = 1 + config.sst_rate;

    // Commission
    const commission_expected = round2(base * config.marketplace_commission_rate * sst);

    // Transaction fee
    const txRate = getTransactionRate(order.payment_method, order.payment_installment, config);
    const transaction_expected = round2(base * txRate * sst);

    // Platform support (flat fee)
    const platform_support_expected = config.platform_support_fee;

    // Cashback programme fee
    let cashback_expected = 0;
    if (config.cashback_enrolled) {
      const cbRate = isCampaign ? config.cashback_rate_campaign : config.cashback_rate_non_campaign;
      cashback_expected = Math.min(round2(base * cbRate * sst), config.cashback_cap_incl_sst);
    }

    // AMS commission
    const amsRate =
      order.ams_actual > 0 ? (amsRates.get(order.order_sn) ?? config.ams_commission_rate) : 0;
    const ams_expected = order.ams_actual > 0 ? round2(base * amsRate) : 0;

    // Diffs (positive = actual > expected = overcharged)
    const commission_diff = round2(order.commission_actual - commission_expected);
    const transaction_diff = round2(order.transaction_actual - transaction_expected);
    const platform_support_diff = round2(order.platform_support_actual - platform_support_expected);
    const cashback_diff = round2(order.cashback_actual - cashback_expected);
    const ams_diff = round2(order.ams_actual - ams_expected);
    const total_diff = round2(
      commission_diff + transaction_diff + platform_support_diff + cashback_diff + ams_diff,
    );

    const has_discrepancy = Math.abs(total_diff) > config.tolerance;

    return {
      ...order,
      is_campaign_day: isCampaign,
      commission_expected,
      transaction_expected,
      platform_support_expected,
      cashback_expected,
      ams_expected,
      ams_rate_used: amsRate,
      commission_diff,
      transaction_diff,
      platform_support_diff,
      cashback_diff,
      ams_diff,
      total_diff,
      has_discrepancy,
    };
  });
}
```

- [ ] **Step 2: Run tests and confirm they pass**

```bash
npx jest __tests__/lib/reconciliation-engine.test.ts --no-coverage
```

Expected: all tests PASS

- [ ] **Step 3: Run all tests to confirm nothing is broken**

```bash
npx jest --no-coverage
```

Expected: all pre-existing tests still PASS

- [ ] **Step 4: Commit**

```bash
git add lib/reconciliation-engine.ts __tests__/lib/reconciliation-engine.test.ts
git commit -m "feat: add reconciliation engine with tests"
```

---

## Task 9: Upload API Route

**Files:**

- Create: `app/api/reconciliation/upload/route.ts`

This route accepts a payout XLSX, parses it, runs reconciliation, persists to Supabase, and returns the period ID and summary.

- [ ] **Step 1: Create the upload route**

Create `app/api/reconciliation/upload/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { parsePayout } from '@/lib/payout-parser';
import { reconcileOrders } from '@/lib/reconciliation-engine';
import { FEE_CONFIG } from '@/lib/fee-config';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    if (!file.name.endsWith('.xlsx')) {
      return NextResponse.json({ error: 'File must be a .xlsx payout report' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { meta, orders } = parsePayout(buffer);

    if (!orders.length) {
      return NextResponse.json({ error: 'No orders found in payout report' }, { status: 400 });
    }

    const results = reconcileOrders(orders, FEE_CONFIG);
    const total_actual = +results
      .reduce(
        (s, r) =>
          s +
          r.commission_actual +
          r.transaction_actual +
          r.platform_support_actual +
          r.cashback_actual +
          r.ams_actual,
        0,
      )
      .toFixed(2);
    const total_expected = +results
      .reduce(
        (s, r) =>
          s +
          r.commission_expected +
          r.transaction_expected +
          r.platform_support_expected +
          r.cashback_expected +
          r.ams_expected,
        0,
      )
      .toFixed(2);
    const total_diff = +(total_actual - total_expected).toFixed(2);

    // Insert payout period
    const { data: period, error: periodErr } = await supabase
      .from('payout_periods')
      .insert({
        period_from: meta.period_from,
        period_to: meta.period_to,
        source: 'xlsx',
        total_expected,
        total_actual,
        total_diff,
      })
      .select('id')
      .single();

    if (periodErr) throw periodErr;

    // Insert payout orders (batch)
    const rows = results.map((r) => ({
      period_id: period.id,
      order_sn: r.order_sn,
      payout_date: r.payout_date || null,
      product_price: r.product_price,
      payment_method: r.payment_method,
      payment_installment: r.payment_installment,
      is_campaign_day: r.is_campaign_day,
      commission_actual: r.commission_actual,
      transaction_actual: r.transaction_actual,
      platform_support_actual: r.platform_support_actual,
      cashback_actual: r.cashback_actual,
      ams_actual: r.ams_actual,
      commission_expected: r.commission_expected,
      transaction_expected: r.transaction_expected,
      platform_support_expected: r.platform_support_expected,
      cashback_expected: r.cashback_expected,
      ams_expected: r.ams_expected,
      ams_rate_used: r.ams_rate_used,
      commission_diff: r.commission_diff,
      transaction_diff: r.transaction_diff,
      platform_support_diff: r.platform_support_diff,
      cashback_diff: r.cashback_diff,
      ams_diff: r.ams_diff,
      total_diff: r.total_diff,
      has_discrepancy: r.has_discrepancy,
    }));

    const { error: ordersErr } = await supabase.from('payout_orders').insert(rows);
    if (ordersErr) throw ordersErr;

    return NextResponse.json({
      ok: true,
      period_id: period.id,
      period_from: meta.period_from,
      period_to: meta.period_to,
      orders_count: results.length,
      discrepancies: results.filter((r) => r.has_discrepancy).length,
      total_expected,
      total_actual,
      total_diff,
    });
  } catch (err) {
    console.error('reconciliation/upload error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/reconciliation/upload/route.ts
git commit -m "feat: add reconciliation XLSX upload API route"
```

---

## Task 10: Fetch API Route (Auto-fetch from Shopee)

**Files:**

- Create: `app/api/reconciliation/fetch/route.ts`

This route fetches released income orders from the Shopee Income API (chunked ≤14 days), then calls `get_escrow_detail_batch` for fee breakdown, reconciles, and stores.

Note: The Income API (`get_income_detail`) and escrow API (`get_escrow_detail_batch`) are both needed — the former gives the order list, the latter gives per-fee-component breakdowns.

- [ ] **Step 1: Create the fetch route**

Create `app/api/reconciliation/fetch/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { callShopee, loadTokensOrThrow } from '@/lib/shopee';
import { normaliseEscrowOrder } from '@/lib/payout-parser';
import { reconcileOrders } from '@/lib/reconciliation-engine';
import { FEE_CONFIG } from '@/lib/fee-config';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const MAX_CHUNK_DAYS = 13; // API max is 14 days; use 13 to be safe
const ESCROW_BATCH_SIZE = 20;

/** Split a date range into ≤13-day chunks, returning [from, to] Unix timestamps */
function chunkDateRange(fromDate: string, toDate: string): [number, number][] {
  const chunks: [number, number][] = [];
  let cursor = new Date(fromDate);
  const end = new Date(toDate);
  end.setHours(23, 59, 59);

  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + MAX_CHUNK_DAYS);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    chunks.push([Math.floor(cursor.getTime() / 1000), Math.floor(chunkEnd.getTime() / 1000)]);
    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }

  return chunks;
}

/** Fetch all released order SNs for a period via get_income_detail */
async function fetchOrderSns(
  fromTs: number,
  toTs: number,
  tokens: Awaited<ReturnType<typeof loadTokensOrThrow>>,
): Promise<string[]> {
  const sns: string[] = [];
  let cursor = '';

  while (true) {
    const params: Record<string, string | number> = {
      shop_id: tokens.shop_id,
      release_time_from: fromTs,
      release_time_to: toTs,
      income_type: 1, // 1 = Released
      page_size: 100,
    };
    if (cursor) params.cursor = cursor;

    const res = await callShopee<{
      response: {
        income_list: { order_sn: string }[];
        next_cursor: string;
        has_next_page: boolean;
      };
    }>('/api/v2/payment/get_income_detail', params, tokens);

    const list = res.response?.income_list ?? [];
    sns.push(...list.map((o) => o.order_sn));

    if (!res.response?.has_next_page) break;
    cursor = res.response.next_cursor;
  }

  return [...new Set(sns)];
}

/** Fetch fee breakdown for a batch of order SNs via get_escrow_detail_batch */
async function fetchEscrowBatch(
  sns: string[],
  tokens: Awaited<ReturnType<typeof loadTokensOrThrow>>,
) {
  const res = await callShopee<{
    response: {
      result_list: {
        order_sn: string;
        escrow_detail: {
          order_income: {
            buyer_total_amount: number;
            commission_fee: number;
            service_fee: number;
            seller_transaction_fee: number;
            ams_commission_fee?: number;
            escrow_amount: number;
            voucher_from_seller?: number;
          };
          release_time?: number;
        };
      }[];
    };
  }>(
    '/api/v2/payment/get_escrow_detail_batch',
    {
      shop_id: tokens.shop_id,
      order_sn_list: sns.join(','),
    },
    tokens,
  );

  return res.response?.result_list ?? [];
}

export async function POST(req: NextRequest) {
  try {
    const { from_date, to_date } = (await req.json()) as { from_date: string; to_date: string };

    if (!from_date || !to_date) {
      return NextResponse.json(
        { error: 'from_date and to_date required (YYYY-MM-DD)' },
        { status: 400 },
      );
    }

    const tokens = await loadTokensOrThrow();
    const chunks = chunkDateRange(from_date, to_date);

    // Collect all order SNs across chunks
    const allSns: string[] = [];
    for (const [fromTs, toTs] of chunks) {
      const sns = await fetchOrderSns(fromTs, toTs, tokens);
      allSns.push(...sns);
    }
    const uniqueSns = [...new Set(allSns)];

    if (!uniqueSns.length) {
      return NextResponse.json(
        { error: 'No released orders found for this period' },
        { status: 404 },
      );
    }

    // Fetch escrow details in batches of 20
    const escrowResults: ReturnType<typeof normaliseEscrowOrder>[] = [];
    for (let i = 0; i < uniqueSns.length; i += ESCROW_BATCH_SIZE) {
      const batch = uniqueSns.slice(i, i + ESCROW_BATCH_SIZE);
      const batchResults = await fetchEscrowBatch(batch, tokens);
      for (const item of batchResults) {
        if (!item.escrow_detail) continue;
        const income = item.escrow_detail.order_income;
        escrowResults.push(
          normaliseEscrowOrder({
            order_sn: item.order_sn,
            release_time: item.escrow_detail.release_time,
            buyer_total_amount: income.buyer_total_amount,
            commission_fee: income.commission_fee,
            service_fee: income.service_fee,
            seller_transaction_fee: income.seller_transaction_fee,
            ams_commission_fee: income.ams_commission_fee,
            original_cost_of_goods_sold: income.buyer_total_amount,
          }),
        );
      }
    }

    const results = reconcileOrders(escrowResults, FEE_CONFIG);
    const total_actual = +results
      .reduce(
        (s, r) =>
          s +
          r.commission_actual +
          r.transaction_actual +
          r.platform_support_actual +
          r.cashback_actual +
          r.ams_actual,
        0,
      )
      .toFixed(2);
    const total_expected = +results
      .reduce(
        (s, r) =>
          s +
          r.commission_expected +
          r.transaction_expected +
          r.platform_support_expected +
          r.cashback_expected +
          r.ams_expected,
        0,
      )
      .toFixed(2);
    const total_diff = +(total_actual - total_expected).toFixed(2);

    const { data: period, error: periodErr } = await supabase
      .from('payout_periods')
      .insert({
        period_from: from_date,
        period_to: to_date,
        source: 'api',
        total_expected,
        total_actual,
        total_diff,
      })
      .select('id')
      .single();
    if (periodErr) throw periodErr;

    const rows = results.map((r) => ({
      period_id: period.id,
      order_sn: r.order_sn,
      payout_date: r.payout_date || null,
      product_price: r.product_price,
      payment_method: r.payment_method,
      payment_installment: r.payment_installment,
      is_campaign_day: r.is_campaign_day,
      commission_actual: r.commission_actual,
      transaction_actual: r.transaction_actual,
      platform_support_actual: r.platform_support_actual,
      cashback_actual: r.cashback_actual,
      ams_actual: r.ams_actual,
      commission_expected: r.commission_expected,
      transaction_expected: r.transaction_expected,
      platform_support_expected: r.platform_support_expected,
      cashback_expected: r.cashback_expected,
      ams_expected: r.ams_expected,
      ams_rate_used: r.ams_rate_used,
      commission_diff: r.commission_diff,
      transaction_diff: r.transaction_diff,
      platform_support_diff: r.platform_support_diff,
      cashback_diff: r.cashback_diff,
      ams_diff: r.ams_diff,
      total_diff: r.total_diff,
      has_discrepancy: r.has_discrepancy,
    }));

    const { error: ordersErr } = await supabase.from('payout_orders').insert(rows);
    if (ordersErr) throw ordersErr;

    return NextResponse.json({
      ok: true,
      period_id: period.id,
      period_from: from_date,
      period_to: to_date,
      orders_count: results.length,
      discrepancies: results.filter((r) => r.has_discrepancy).length,
      total_expected,
      total_actual,
      total_diff,
    });
  } catch (err) {
    console.error('reconciliation/fetch error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Check that `loadTokensOrThrow` exists in `lib/shopee.ts`**

Run:

```bash
grep -n "loadTokensOrThrow\|export.*loadTokens" lib/shopee.ts
```

If only `loadTokens` exists (returns null on missing), add this helper to `lib/shopee.ts`:

```typescript
/** Like loadTokens but throws if no tokens are stored (shop not connected) */
export async function loadTokensOrThrow(): Promise<ShopeeTokens> {
  const tokens = await loadTokens();
  if (!tokens) throw new Error('Shop not connected. Please authenticate first.');
  return tokens;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/reconciliation/fetch/route.ts lib/shopee.ts
git commit -m "feat: add reconciliation API auto-fetch route"
```

---

## Task 11: Data API Routes

**Files:**

- Create: `app/api/reconciliation/periods/route.ts`
- Create: `app/api/reconciliation/orders/route.ts`
- Create: `app/api/reconciliation/notes/[orderSn]/route.ts`

- [ ] **Step 1: Create periods route**

Create `app/api/reconciliation/periods/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabase
    .from('payout_periods')
    .select('*')
    .order('period_from', { ascending: false })
    .limit(24); // up to 2 years of monthly runs

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Create orders route**

Create `app/api/reconciliation/orders/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period_id = searchParams.get('period_id');
  const filter = searchParams.get('filter') ?? 'all'; // all | discrepancies | investigating | resolved

  if (!period_id) {
    return NextResponse.json({ error: 'period_id required' }, { status: 400 });
  }

  // Fetch orders
  let query = supabase
    .from('payout_orders')
    .select('*')
    .eq('period_id', period_id)
    .order('payout_date', { ascending: true });

  if (filter === 'discrepancies') query = query.eq('has_discrepancy', true);

  const { data: orders, error: ordersErr } = await query;
  if (ordersErr) return NextResponse.json({ error: ordersErr.message }, { status: 500 });

  // Fetch notes for this period and merge
  const { data: notes } = await supabase
    .from('recon_notes')
    .select('order_sn, status, notes')
    .eq('period_id', period_id);

  const notesMap = new Map((notes ?? []).map((n) => [n.order_sn, n]));

  const merged = (orders ?? []).map((o) => ({
    ...o,
    status: notesMap.get(o.order_sn)?.status ?? 'unreviewed',
    notes: notesMap.get(o.order_sn)?.notes ?? null,
  }));

  // If filtering by status, apply after merge
  const filtered =
    filter === 'investigating' || filter === 'resolved'
      ? merged.filter((o) => o.status === filter)
      : merged;

  return NextResponse.json(filtered);
}
```

- [ ] **Step 3: Create notes route**

Create `app/api/reconciliation/notes/[orderSn]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { orderSn: string } }) {
  const { period_id, status, notes } = (await req.json()) as {
    period_id: string;
    status: 'unreviewed' | 'investigating' | 'resolved';
    notes?: string;
  };

  if (!period_id || !status) {
    return NextResponse.json({ error: 'period_id and status required' }, { status: 400 });
  }

  const { error } = await supabase.from('recon_notes').upsert(
    {
      order_sn: params.orderSn,
      period_id,
      status,
      notes: notes ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'order_sn,period_id' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/reconciliation/periods/route.ts \
        app/api/reconciliation/orders/route.ts \
        app/api/reconciliation/notes/[orderSn]/route.ts
git commit -m "feat: add reconciliation data API routes (periods, orders, notes)"
```

---

## Task 12: UI Components

**Files:**

- Create: `components/ReconciliationSummary.tsx`
- Create: `components/ReconciliationTable.tsx`

- [ ] **Step 1: Create summary cards component**

Create `components/ReconciliationSummary.tsx`:

```typescript
'use client'

interface Props {
  totalExpected: number
  totalActual: number
  totalDiff: number
  discrepancyCount: number
  totalOrders: number
}

function fmt(n: number) {
  return `RM${Math.abs(n).toFixed(2)}`
}

export default function ReconciliationSummary({
  totalExpected, totalActual, totalDiff, discrepancyCount, totalOrders
}: Props) {
  const isOvercharged = totalDiff > 0

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-6">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs text-gray-500 mb-1">Expected Fees</p>
        <p className="text-xl font-semibold text-gray-800">{fmt(totalExpected)}</p>
      </div>
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs text-gray-500 mb-1">Actual Fees</p>
        <p className="text-xl font-semibold text-gray-800">{fmt(totalActual)}</p>
      </div>
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs text-gray-500 mb-1">Total Discrepancy</p>
        <p className={`text-xl font-semibold ${Math.abs(totalDiff) < 0.02 ? 'text-green-600' : isOvercharged ? 'text-red-600' : 'text-amber-600'}`}>
          {totalDiff >= 0 ? '+' : '-'}{fmt(totalDiff)}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {Math.abs(totalDiff) < 0.02 ? 'No discrepancy' : isOvercharged ? 'Overcharged' : 'Undercharged'}
        </p>
      </div>
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs text-gray-500 mb-1">Orders w/ Discrepancies</p>
        <p className="text-xl font-semibold text-gray-800">
          {discrepancyCount} <span className="text-sm text-gray-400">/ {totalOrders}</span>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create order table component**

Create `components/ReconciliationTable.tsx`:

```typescript
'use client'

import { useState } from 'react'
import type { PayoutOrder } from '@/types/reconciliation'

interface Props {
  orders: PayoutOrder[]
  periodId: string
  onStatusUpdate: (orderSn: string, status: PayoutOrder['status'], notes: string) => void
}

function DiffCell({ expected, actual, diff }: { expected: number; actual: number; diff: number }) {
  const isDiscrepancy = Math.abs(diff) >= 0.02
  return (
    <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
      <span className="text-gray-500">{actual.toFixed(2)}</span>
      {isDiscrepancy && (
        <span className={`ml-1 font-medium ${diff > 0 ? 'text-red-600' : 'text-amber-600'}`}>
          {diff > 0 ? '+' : ''}{diff.toFixed(2)}
        </span>
      )}
    </td>
  )
}

function StatusBadge({ status }: { status: PayoutOrder['status'] }) {
  const colours = {
    unreviewed:   'bg-gray-100 text-gray-600',
    investigating:'bg-amber-100 text-amber-700',
    resolved:     'bg-green-100 text-green-700',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colours[status]}`}>
      {status}
    </span>
  )
}

function OrderRow({ order, periodId, onStatusUpdate }: {
  order: PayoutOrder
  periodId: string
  onStatusUpdate: Props['onStatusUpdate']
}) {
  const [expanded, setExpanded] = useState(false)
  const [editStatus, setEditStatus] = useState(order.status)
  const [editNotes, setEditNotes] = useState(order.notes ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await onStatusUpdate(order.order_sn, editStatus, editNotes)
    setSaving(false)
  }

  return (
    <>
      <tr
        className={`border-b cursor-pointer hover:bg-gray-50 ${order.has_discrepancy ? 'bg-amber-50' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-3 py-2 text-xs font-mono">{order.order_sn}</td>
        <td className="px-3 py-2 text-xs text-gray-500">{order.payout_date}</td>
        <DiffCell expected={order.commission_expected}       actual={order.commission_actual}       diff={order.commission_diff} />
        <DiffCell expected={order.transaction_expected}      actual={order.transaction_actual}      diff={order.transaction_diff} />
        <DiffCell expected={order.platform_support_expected} actual={order.platform_support_actual} diff={order.platform_support_diff} />
        <DiffCell expected={order.cashback_expected}         actual={order.cashback_actual}         diff={order.cashback_diff} />
        <DiffCell expected={order.ams_expected}              actual={order.ams_actual}              diff={order.ams_diff} />
        <td className="px-3 py-2"><StatusBadge status={order.status} /></td>
        <td className="px-3 py-2 text-xs text-center">{expanded ? '▲' : '▼'}</td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50 border-b">
          <td colSpan={9} className="px-4 py-3">
            <div className="flex flex-wrap gap-4 items-start">
              <div className="text-xs space-y-1 flex-1 min-w-48">
                <p className="font-medium text-gray-700 mb-1">Fee Breakdown</p>
                {[
                  { label: 'Commission',       exp: order.commission_expected,       act: order.commission_actual,       diff: order.commission_diff },
                  { label: 'Transaction',      exp: order.transaction_expected,      act: order.transaction_actual,      diff: order.transaction_diff },
                  { label: 'Platform Support', exp: order.platform_support_expected, act: order.platform_support_actual, diff: order.platform_support_diff },
                  { label: 'Cashback',         exp: order.cashback_expected,         act: order.cashback_actual,         diff: order.cashback_diff },
                  { label: 'AMS',              exp: order.ams_expected,              act: order.ams_actual,              diff: order.ams_diff },
                ].map(({ label, exp, act, diff }) => (
                  <div key={label} className="flex gap-2">
                    <span className="w-32 text-gray-500">{label}</span>
                    <span>Exp: RM{exp.toFixed(2)}</span>
                    <span>Act: RM{act.toFixed(2)}</span>
                    {Math.abs(diff) >= 0.02 && (
                      <span className={diff > 0 ? 'text-red-600' : 'text-amber-600'}>
                        Δ {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2 min-w-48">
                <p className="text-xs font-medium text-gray-700">Status</p>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as PayoutOrder['status'])}
                  className="text-xs border rounded px-2 py-1"
                >
                  <option value="unreviewed">Unreviewed</option>
                  <option value="investigating">Investigating</option>
                  <option value="resolved">Resolved</option>
                </select>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Add notes..."
                  className="text-xs border rounded px-2 py-1 h-16 resize-none"
                />
                <button
                  onClick={(e) => { e.stopPropagation(); save() }}
                  disabled={saving}
                  className="text-xs bg-orange-500 text-white rounded px-3 py-1 hover:bg-orange-600 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function ReconciliationTable({ orders, periodId, onStatusUpdate }: Props) {
  const [filter, setFilter] = useState<'all' | 'discrepancies' | 'investigating' | 'resolved'>('all')

  const filtered = orders.filter((o) => {
    if (filter === 'discrepancies') return o.has_discrepancy
    if (filter === 'investigating') return o.status === 'investigating'
    if (filter === 'resolved')      return o.status === 'resolved'
    return true
  })

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {(['all', 'discrepancies', 'investigating', 'resolved'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs rounded-full px-3 py-1 border ${filter === f ? 'bg-orange-500 text-white border-orange-500' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400 self-center">{filtered.length} orders</span>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Order ID</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Comm.</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Trans.</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Platform</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Cashback</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">AMS</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
              <th className="px-3 py-2 w-6"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((order) => (
              <OrderRow
                key={order.order_sn}
                order={order}
                periodId={periodId}
                onStatusUpdate={onStatusUpdate}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/ReconciliationSummary.tsx components/ReconciliationTable.tsx
git commit -m "feat: add reconciliation UI components"
```

---

## Task 13: Reconciliation Page

**Files:**

- Create: `app/reconciliation/page.tsx`

- [ ] **Step 1: Create the reconciliation page**

Create `app/reconciliation/page.tsx`:

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import ReconciliationSummary from '@/components/ReconciliationSummary'
import ReconciliationTable from '@/components/ReconciliationTable'
import type { PayoutPeriod, PayoutOrder } from '@/types/reconciliation'

export default function ReconciliationPage() {
  const [periods, setPeriods] = useState<PayoutPeriod[]>([])
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null)
  const [orders, setOrders] = useState<PayoutOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch API auto-fetch state
  const [fetchFrom, setFetchFrom] = useState('')
  const [fetchTo, setFetchTo] = useState('')

  const activePeriod = periods.find((p) => p.id === activePeriodId) ?? null

  // Load period list on mount
  useEffect(() => {
    fetch('/api/reconciliation/periods')
      .then((r) => r.json())
      .then((data) => {
        setPeriods(data)
        if (data.length > 0) setActivePeriodId(data[0].id)
      })
  }, [])

  // Load orders when active period changes
  useEffect(() => {
    if (!activePeriodId) return
    setLoading(true)
    fetch(`/api/reconciliation/orders?period_id=${activePeriodId}`)
      .then((r) => r.json())
      .then((data) => { setOrders(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [activePeriodId])

  async function handleXlsxUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/reconciliation/upload', { method: 'POST', body: form })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setUploading(false); return }
    // Reload periods and select the new one
    const periodsRes = await fetch('/api/reconciliation/periods')
    const newPeriods = await periodsRes.json()
    setPeriods(newPeriods)
    setActivePeriodId(data.period_id)
    setUploading(false)
    e.target.value = ''
  }

  async function handleApiFetch() {
    if (!fetchFrom || !fetchTo) { setError('Please enter both from and to dates'); return }
    setFetching(true)
    setError(null)
    const res = await fetch('/api/reconciliation/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_date: fetchFrom, to_date: fetchTo }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setFetching(false); return }
    const periodsRes = await fetch('/api/reconciliation/periods')
    const newPeriods = await periodsRes.json()
    setPeriods(newPeriods)
    setActivePeriodId(data.period_id)
    setFetching(false)
  }

  const handleStatusUpdate = useCallback(async (
    orderSn: string,
    status: PayoutOrder['status'],
    notes: string
  ) => {
    await fetch(`/api/reconciliation/notes/${orderSn}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period_id: activePeriodId, status, notes }),
    })
    // Optimistically update local state
    setOrders((prev) => prev.map((o) =>
      o.order_sn === orderSn ? { ...o, status, notes } : o
    ))
  }, [activePeriodId])

  const totalExpected   = orders.reduce((s, o) => s + o.commission_expected + o.transaction_expected + o.platform_support_expected + o.cashback_expected + o.ams_expected, 0)
  const totalActual     = orders.reduce((s, o) => s + o.commission_actual + o.transaction_actual + o.platform_support_actual + o.cashback_actual + o.ams_actual, 0)
  const totalDiff       = totalActual - totalExpected
  const discrepancies   = orders.filter((o) => o.has_discrepancy).length

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Fee Reconciliation</h1>

        {/* Period history selector */}
        {periods.length > 0 && (
          <select
            value={activePeriodId ?? ''}
            onChange={(e) => setActivePeriodId(e.target.value)}
            className="text-sm border rounded px-3 py-1.5"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.period_from} → {p.period_to} ({p.source.toUpperCase()})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Data source controls */}
      <div className="flex flex-wrap gap-4 mb-6 p-4 rounded-xl border bg-white shadow-sm">
        {/* XLSX upload */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Upload Payout Report:</label>
          <label className="cursor-pointer rounded bg-orange-500 px-3 py-1.5 text-sm text-white hover:bg-orange-600">
            {uploading ? 'Uploading…' : 'Choose XLSX'}
            <input type="file" accept=".xlsx" className="hidden" onChange={handleXlsxUpload} disabled={uploading} />
          </label>
        </div>

        <div className="w-px bg-gray-200 self-stretch" />

        {/* API fetch */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-sm font-medium text-gray-700">Fetch from API:</label>
          <input type="date" value={fetchFrom} onChange={(e) => setFetchFrom(e.target.value)}
            className="text-sm border rounded px-2 py-1" />
          <span className="text-gray-400">→</span>
          <input type="date" value={fetchTo} onChange={(e) => setFetchTo(e.target.value)}
            className="text-sm border rounded px-2 py-1" />
          <button onClick={handleApiFetch} disabled={fetching}
            className="rounded bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
            {fetching ? 'Fetching…' : 'Fetch'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {activePeriod && (
        <p className="text-sm text-gray-500 mb-4">
          {activePeriod.period_from} – {activePeriod.period_to} · {activePeriod.source.toUpperCase()} · {orders.length} orders
        </p>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading orders…</div>
      ) : orders.length > 0 ? (
        <>
          <ReconciliationSummary
            totalExpected={totalExpected}
            totalActual={totalActual}
            totalDiff={totalDiff}
            discrepancyCount={discrepancies}
            totalOrders={orders.length}
          />
          <ReconciliationTable
            orders={orders}
            periodId={activePeriodId!}
            onStatusUpdate={handleStatusUpdate}
          />
        </>
      ) : (
        <div className="text-center py-16 text-gray-400">
          Upload a payout report or fetch from the API to start reconciling.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/reconciliation/page.tsx
git commit -m "feat: add reconciliation page"
```

---

## Task 14: Navigation + End-to-End Smoke Test

**Files:**

- Modify: `components/Dashboard.tsx`

- [ ] **Step 1: Add Reconciliation link to the dashboard nav**

In `components/Dashboard.tsx`, find where the navigation links are rendered (look for links to `/upload` or similar). Add a link to `/reconciliation`:

```typescript
// Add alongside existing nav links
<a href="/reconciliation" className="text-sm text-gray-600 hover:text-orange-500">
  Reconciliation
</a>
```

The exact placement depends on the existing nav structure. Run `grep -n "upload\|href=" components/Dashboard.tsx` to find the right spot.

- [ ] **Step 2: Run the dev server**

```bash
npm run dev
```

Navigate to `http://localhost:3000/reconciliation`. Confirm the page loads with the upload control.

- [ ] **Step 3: Smoke test — XLSX upload**

Upload `C:\Users\Justin Yow\Downloads\Income.released.my.20260401_20260408.xlsx`.

Verify:

1. No error message appears
2. Period "2026-04-01 → 2026-04-08" appears in the history selector
3. Summary cards show Expected Fees, Actual Fees, Discrepancy, Order count
4. Order table loads with rows
5. For order `2604063YUH73T6`: Commission actual = 7.67, expected = 7.67, diff = 0.00
6. Click any row to expand — fee breakdown and status controls appear
7. Change status to "Investigating", add a note, click Save — confirm it persists on page reload

- [ ] **Step 4: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: all tests PASS

- [ ] **Step 5: Final commit**

```bash
git add components/Dashboard.tsx
git commit -m "feat: add Reconciliation nav link — fee reconciliation tool complete"
```

---

## Self-Review Checklist

- [x] **Fee Reference Document** — Task 1 ✓
- [x] **Types** — Task 2 ✓
- [x] **Fee Config** — Task 3 ✓
- [x] **Database Schema** — Task 4 ✓
- [x] **Payout Parser (TDD)** — Tasks 5 & 6 ✓
- [x] **Reconciliation Engine (TDD)** — Tasks 7 & 8 ✓
- [x] **XLSX Upload Route** — Task 9 ✓
- [x] **API Fetch Route** — Task 10 ✓
- [x] **Data API Routes (periods, orders, notes)** — Task 11 ✓
- [x] **UI Components** — Task 12 ✓
- [x] **Reconciliation Page** — Task 13 ✓
- [x] **Navigation + E2E Test** — Task 14 ✓

**Type consistency check:**

- `PayoutOrderRow` defined in Task 2, used in Tasks 5/6/7/8/9/10 — consistent ✓
- `ReconOrderResult` extends `PayoutOrderRow` — used in Tasks 7/8/9/10 — consistent ✓
- `PayoutOrder` (DB shape with `status`/`notes`) — used in Task 12/13 — consistent ✓
- `parsePayout()` returns `{ meta, orders }` — called the same way in Task 9 ✓
- `reconcileOrders()` signature matches usage in Tasks 9/10 ✓
- `normaliseEscrowOrder()` defined in Task 6, used in Task 10 ✓

**Placeholder scan:** No TBD/TODO/placeholder patterns found. ✓

**Spec coverage check:**

- Architecture (payout parser + engine + storage + UI) ✓
- Both data sources (XLSX upload + API fetch) ✓
- All 5 reconcilable fee components ✓
- AMS rate from API + snapshot ✓
- Three DB tables ✓
- Summary cards ✓
- Order table with E/A/Δ per component ✓
- Discrepancy status tracking (unreviewed/investigating/resolved + notes) ✓
- History (period selector) ✓
- `docs/shopee-fees-reference.md` ✓
- `lib/fee-config.ts` ✓
