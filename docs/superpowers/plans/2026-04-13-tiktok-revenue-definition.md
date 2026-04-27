# TikTok Revenue Definition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the TikTok revenue calculation with "Product Revenue" (MSRP − seller discount) as the default, add a toggle to include buyer shipping ("Gross Revenue"), and surface both a formula caption and ℹ tooltip so any viewer can understand what the numbers mean.

**Architecture:** The TikTok API route always returns both `productRevenue` and `shippingRevenue` per day and order so the frontend can combine them client-side without a second fetch. The toggle state lives in React state, persisted to `localStorage`. The toggle only renders when `platform === 'tiktok'`; Shopee and "All platforms" views are unchanged.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS, Recharts

**Spec:** `docs/superpowers/specs/2026-04-13-tiktok-revenue-definition-design.md`

---

## File Map

| File                              | Action | What changes                                                             |
| --------------------------------- | ------ | ------------------------------------------------------------------------ |
| `types/shopee.ts`                 | Modify | Add optional shipping fields to `RevenueData`                            |
| `app/api/tiktok/revenue/route.ts` | Modify | Replace `calcOrderRevenue` with two functions; return shipping fields    |
| `components/RevenueSection.tsx`   | Modify | Toggle, localStorage, dynamic label, tooltip, caption, chart data, table |

---

## Task 1: Extend `RevenueData` with optional shipping fields

**Files:**

- Modify: `types/shopee.ts`

These fields are optional so the Shopee route and existing `mergeRevenue` logic are not affected.

- [ ] **Step 1: Update `RevenueData` in `types/shopee.ts`**

Replace the existing `RevenueData` interface with:

```ts
export interface RevenueData {
  total_revenue: number;
  order_count: number;
  daily: { date: string; revenue: number; shippingRevenue?: number }[];
  orders: {
    order_sn: string;
    date: string;
    status: string;
    amount: number;
    shippingAmount?: number;
  }[];
  capped: boolean;
  prev_total_revenue: number;
  prev_order_count: number;
  // TikTok-only — undefined for Shopee
  total_shipping_revenue?: number;
  prev_total_shipping_revenue?: number;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "C:\Users\Justin Yow\Claude Code\shopee-dashboard" && npx tsc --noEmit
```

Expected: no errors (or same errors as before this change — new fields are optional and additive).

- [ ] **Step 3: Commit**

```bash
git add types/shopee.ts
git commit -m "types: add optional shipping fields to RevenueData for TikTok"
```

---

## Task 2: Update TikTok revenue API route

**Files:**

- Modify: `app/api/tiktok/revenue/route.ts`

Replace the single `calcOrderRevenue` with two pure functions, update the daily/order tracking to capture both components, and include shipping totals in the JSON response. The `total_revenue` field stays as product-only for backward compat with `mergeRevenue` in the frontend.

- [ ] **Step 1: Replace `calcOrderRevenue` with `calcProductRevenue` and `calcShippingRevenue`**

In `app/api/tiktok/revenue/route.ts`, delete the `calcOrderRevenue` function (lines 34–46) and replace with:

```ts
/**
 * Product Revenue = MSRP − seller discounts.
 * Platform discounts excluded (TikTok absorbs them).
 * Falls back to payment.sub_total if original_total_product_price is missing.
 */
function calcProductRevenue(o: {
  payment?: { original_total_product_price?: string; seller_discount?: string; sub_total?: string };
}): number {
  const original = parseFloat(o.payment?.original_total_product_price ?? '0') || 0;
  const sellerDiscount = parseFloat(o.payment?.seller_discount ?? '0') || 0;
  if (original > 0) return original - sellerDiscount;
  // Fallback: sub_total already has seller discounts applied
  return parseFloat(o.payment?.sub_total ?? '0') || 0;
}

/**
 * Shipping Revenue = buyer's paid shipping fee (net of platform shipping discounts).
 * TikTok's payment.shipping_fee already reflects the net amount the buyer paid.
 */
function calcShippingRevenue(o: { payment?: { shipping_fee?: string } }): number {
  return parseFloat(o.payment?.shipping_fee ?? '0') || 0;
}
```

- [ ] **Step 2: Update the daily map and order tracking to capture both components**

In the GET handler, replace the existing daily-map block (currently starting at `const dailyMap = new Map<string, number>();`) with:

```ts
const dailyMap = new Map<string, { product: number; shipping: number }>();
let totalProductRevenue = 0;
let totalShippingRevenue = 0;
const orderRows: RevenueData['orders'] = [];

for (const o of details) {
  const product = calcProductRevenue(o);
  const shipping = calcShippingRevenue(o);
  const date = toMytDate(o.create_time);
  const prev = dailyMap.get(date) ?? { product: 0, shipping: 0 };
  dailyMap.set(date, { product: prev.product + product, shipping: prev.shipping + shipping });
  totalProductRevenue += product;
  totalShippingRevenue += shipping;
  orderRows.push({
    order_sn: o.id,
    date,
    status: o.status,
    amount: product,
    shippingAmount: shipping,
  });
}

const daily = Array.from(dailyMap.entries())
  .map(([date, { product, shipping }]) => ({ date, revenue: product, shippingRevenue: shipping }))
  .sort((a, b) => a.date.localeCompare(b.date));

orderRows.sort((a, b) => b.date.localeCompare(a.date));
```

- [ ] **Step 3: Update the previous-period calculation**

Replace the existing `const prevTotalRevenue = ...` line with:

```ts
let prevTotalProductRevenue = 0;
let prevTotalShippingRevenue = 0;
for (const o of prevDetails) {
  prevTotalProductRevenue += calcProductRevenue(o);
  prevTotalShippingRevenue += calcShippingRevenue(o);
}
```

- [ ] **Step 4: Update the result object**

Replace the existing `result` object with:

```ts
const result: RevenueData = {
  total_revenue: totalProductRevenue, // product only — keeps mergeRevenue working
  order_count: details.length,
  daily,
  orders: orderRows,
  capped,
  prev_total_revenue: prevTotalProductRevenue,
  prev_order_count: prevDetails.length,
  total_shipping_revenue: totalShippingRevenue,
  prev_total_shipping_revenue: prevTotalShippingRevenue,
};
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd "C:\Users\Justin Yow\Claude Code\shopee-dashboard" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Smoke-test the API manually**

Start the dev server (`npm run dev`) and run in a separate terminal (replace timestamps with yesterday's MYT midnight → today's MYT midnight as Unix seconds — e.g. for 2026-04-12 MYT: from=1744387200 to=1744473600):

```bash
curl "http://localhost:3000/api/tiktok/revenue?from=1744387200&to=1744473600&preset=" | jq '{total_revenue, total_shipping_revenue, prev_total_revenue, prev_total_shipping_revenue}'
```

Expected: `total_revenue` ≈ 817.52, `total_shipping_revenue` ≈ 7.10 for "yesterday".

- [ ] **Step 7: Commit**

```bash
git add app/api/tiktok/revenue/route.ts
git commit -m "feat(tiktok): split revenue into product + shipping components"
```

---

## Task 3: Add toggle, label, tooltip, and caption to RevenueSection

**Files:**

- Modify: `components/RevenueSection.tsx`

This task adds the toggle (header), dynamic revenue label, ℹ tooltip, and formula caption to the revenue display. Chart and table wiring come in Task 4.

- [ ] **Step 1: Add `includeShipping` state with localStorage initialiser**

After the existing state declarations (around line 101), add:

```tsx
const [includeShipping, setIncludeShipping] = useState<boolean>(() => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('tiktok-revenue-include-shipping') === 'true';
});
```

- [ ] **Step 2: Add derived display values after the `load` function (before the early returns)**

Add these derived constants between `useEffect` and the `if (loading)` check:

```tsx
// Shipping fields are only present on TikTok responses
const shippingRevenue =
  (data as RevenueData & { total_shipping_revenue?: number })?.total_shipping_revenue ?? 0;
const prevShippingRevenue =
  (data as RevenueData & { prev_total_shipping_revenue?: number })?.prev_total_shipping_revenue ??
  0;
const showShipping = platform === 'tiktok' && includeShipping;
const displayRevenue = (data?.total_revenue ?? 0) + (showShipping ? shippingRevenue : 0);
const prevDisplayRevenue =
  (data?.prev_total_revenue ?? 0) + (showShipping ? prevShippingRevenue : 0);

const revenueLabel =
  platform === 'tiktok' ? (includeShipping ? 'Gross revenue' : 'Product revenue') : 'Total revenue';
const revenueCaption =
  platform === 'tiktok'
    ? includeShipping
      ? 'MSRP − seller discounts + buyer shipping · excl. platform discounts'
      : 'MSRP − seller discounts · excl. platform discounts & shipping'
    : null;
const tooltipLayman = includeShipping
  ? 'Everything customers paid us — products and shipping — before TikTok subsidised anything.'
  : 'What customers paid us for the products, before TikTok subsidised anything.';
const tooltipFormula = includeShipping
  ? 'Formula: MSRP − seller discounts + buyer shipping fee. Platform discounts excluded.'
  : 'Formula: MSRP − seller discounts. Platform discounts excluded.';
```

- [ ] **Step 3: Replace the static section header with a flex row containing the toggle**

Replace the current `<h2>` line:

```tsx
<h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Revenue</h2>
```

With:

```tsx
<div className="flex items-center justify-between mb-4">
  <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Revenue</h2>
  {platform === 'tiktok' && (
    <div className="flex items-center gap-1.5">
      <span
        className={`text-xs font-semibold ${!includeShipping ? 'text-orange-600' : 'text-gray-400'}`}
      >
        Product
      </span>
      <button
        onClick={() => {
          const next = !includeShipping;
          setIncludeShipping(next);
          localStorage.setItem('tiktok-revenue-include-shipping', String(next));
        }}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          includeShipping ? 'bg-orange-500' : 'bg-gray-200'
        }`}
        aria-label="Include buyer shipping in revenue"
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            includeShipping ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      <span
        className={`text-xs font-semibold ${includeShipping ? 'text-orange-600' : 'text-gray-400'}`}
      >
        + Ship
      </span>
    </div>
  )}
</div>
```

- [ ] **Step 4: Update the revenue stat block (headline number, label, tooltip, caption)**

Replace the first `<div>` inside `<div className="flex gap-8 mb-6">` (the revenue stat block, currently lines 152–158):

```tsx
<div>
  <div className="flex items-start gap-2">
    <p className="text-3xl font-bold text-gray-900">RM {displayRevenue.toFixed(2)}</p>
    {data && (
      <DeltaBadge
        current={displayRevenue}
        previous={prevDisplayRevenue}
        periodLabel={periodLabel}
      />
    )}
  </div>
  <div className="flex items-center gap-1 mt-1">
    <p className="text-sm text-gray-500">{revenueLabel}</p>
    {platform === 'tiktok' && (
      <div className="relative group">
        <span className="text-xs text-gray-300 cursor-default border-b border-dotted border-gray-300 leading-none">
          ℹ
        </span>
        <div className="absolute left-5 top-0 z-10 hidden group-hover:block w-60 bg-gray-900 text-white rounded-lg p-3 text-xs shadow-xl">
          <p className="font-semibold mb-1.5">💡 What is {revenueLabel}?</p>
          <p className="text-gray-300 mb-2 leading-relaxed">{tooltipLayman}</p>
          <p className="text-gray-500 border-t border-gray-700 pt-2 leading-relaxed">
            {tooltipFormula}
          </p>
        </div>
      </div>
    )}
  </div>
  {revenueCaption && <p className="text-xs text-gray-300 italic mt-0.5">{revenueCaption}</p>}
</div>
```

- [ ] **Step 5: Verify TypeScript compiles and UI renders**

```bash
npx tsc --noEmit
```

Then open `http://localhost:3000` in the browser with "TikTok Shop" selected:

- Toggle should appear top-right of the Revenue card
- Label below the RM number should read "Product revenue"
- ℹ tooltip should appear on hover
- Formula caption should appear below the label

- [ ] **Step 6: Commit**

```bash
git add components/RevenueSection.tsx
git commit -m "feat(tiktok): add shipping toggle, label, tooltip, and caption to Revenue section"
```

---

## Task 4: Wire toggle to chart and breakdown table

**Files:**

- Modify: `components/RevenueSection.tsx`

- [ ] **Step 1: Add `chartData` to the derived values block and update the LineChart**

At the **end** of the derived values block added in Task 3 Step 2 (after the `tooltipFormula` constant, before the `if (loading)` check), add:

```tsx
const chartData = (data?.daily ?? []).map((d) => ({
  ...d,
  revenue: d.revenue + (showShipping ? (d.shipping_revenue ?? 0) : 0),
}));
```

Then change the `<LineChart>` opening tag from:

```tsx
<LineChart data={data?.daily ?? []}>
```

to:

```tsx
<LineChart data={chartData}>
```

(The `dataKey="revenue"` on `<Line>` remains unchanged — it reads from the mapped data.)

- [ ] **Step 2: Update the breakdown table column header and row amounts**

In the breakdown `<table>`, replace the `<th>` for the amount column:

```tsx
// Before
<th className="pb-2 font-medium text-right">Amount</th>

// After
<th className="pb-2 font-medium text-right">
  {platform === 'tiktok' ? (includeShipping ? 'Gross Revenue' : 'Product Revenue') : 'Amount'}
</th>
```

Replace the row amount cell:

```tsx
// Before
<td className="py-2 text-right font-medium">RM {o.amount.toFixed(2)}</td>

// After
<td className="py-2 text-right font-medium">
  RM {(o.amount + (showShipping ? (o.shipping_amount ?? 0) : 0)).toFixed(2)}
</td>
```

Replace the tfoot total cell:

```tsx
// Before
<td className="pt-2 text-right font-bold text-gray-900">RM {data!.total_revenue.toFixed(2)}</td>

// After
<td className="pt-2 text-right font-bold text-gray-900">RM {displayRevenue.toFixed(2)}</td>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: build succeeds with no type errors.

- [ ] **Step 5: Full manual verification in browser**

With `npm run dev` running, select "TikTok Shop" and "Yesterday":

1. **Product Revenue (toggle off):** Headline ≈ RM 817.52. Label reads "Product revenue". Caption reads "MSRP − seller discounts · excl. platform discounts & shipping". Hover ℹ — tooltip shows layman's + formula.
2. **Gross Revenue (toggle on):** Headline ≈ RM 824.62. Label reads "Gross revenue". Caption and tooltip update.
3. **Chart:** Y-axis values increase slightly when toggle is on (shipping added per day).
4. **Breakdown table:** Column header switches between "Product Revenue" / "Gross Revenue". Row amounts and tfoot total match the headline.
5. **Reload page:** Toggle preference is remembered (localStorage).
6. **Switch to "Last 7 days":** Both modes recalculate correctly across the full period.
7. **Switch to "Shopee" or "All Platforms":** Toggle disappears; label reads "Total revenue"; no caption or tooltip.

- [ ] **Step 6: Commit**

```bash
git add components/RevenueSection.tsx
git commit -m "feat(tiktok): wire shipping toggle to chart, table header, and row amounts"
```

---

## Done

Deploy to Vercel via `git push` (auto-deploys from main). Verify on the live URL against your known "yesterday" figures (RM 817.52 product / RM 824.62 gross).
