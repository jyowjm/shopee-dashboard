# TikTok Revenue Definition — Design Spec

**Date:** 2026-04-13  
**Status:** Approved

---

## Context

The TikTok Revenue section was previously calculating revenue using `sale_price × quantity` per line item, which equals **MSRP − Seller Discount − Platform Discount**. This understates the true product revenue because it subtracts platform discounts — amounts TikTok pays, not us.

Additionally, the dashboard had no labelling to explain what the revenue figure represented, making it opaque to anyone unfamiliar with the calculation.

This design defines two revenue views and adds a toggle + tooltip to make the numbers self-explanatory.

---

## Revenue Definitions

### Primary: Product Revenue (default)

> **"What customers paid us for the products, before TikTok subsidised anything."**

```
Product Revenue = payment.original_total_product_price − payment.seller_discount
```

- Platform discounts excluded — TikTok absorbs them, not us
- Shipping excluded — counted separately in Gross Revenue
- Formula caption shown: _"MSRP − seller discounts · excl. platform discounts & shipping"_

### Secondary: Gross Revenue (toggle on)

> **"Everything customers paid us — products and shipping — before TikTok subsidised anything."**

```
Gross Revenue = Product Revenue + payment.shipping_fee
```

- `payment.shipping_fee` is the buyer's paid shipping net of platform shipping discounts (TikTok's field already accounts for this)
- Matches TikTok's own "Gross Revenue" figure on their seller dashboard
- Designed to be consistent with future Shopify integration (Shopify combines product + shipping into one revenue figure)
- Formula caption shown: _"MSRP − seller discounts + buyer shipping · excl. platform discounts"_

### Excluded from both

- Orders with status: `UNPAID`, `ON_HOLD`, `CANCELLED`, `PARTIALLY_REFUNDED` (unchanged)
- Platform discounts (TikTok absorbs)
- Actual logistics cost (an expense, not a revenue deduction)

---

## UI Design

### Toggle

- Placed in the **top-right of the Revenue card header**, inline with the "REVENUE" section label
- Style: minimal pill — matches existing dashboard light theme
- Labels: **"Product"** (off) / **"+ Ship"** (on)
- Default state: **off** (Product Revenue)
- Persisted in **localStorage** (`tiktok-revenue-include-shipping`) so preference survives page reloads

### Revenue Label + Tooltip

Replaces the existing static "Total revenue" label below the headline number.

- **Dynamic label**: "Product revenue" or "Gross revenue" depending on toggle state
- **ℹ icon** next to the label — hover shows a tooltip
- **Tooltip content** (two sections):
  1. Layman's line: plain-English explanation (see definitions above)
  2. Formula line: the technical formula + what's excluded
- **Formula caption**: one line of very small, subdued italic text immediately below the label, always visible without hover — updates with toggle

### Scope of toggle effect

Flipping the toggle updates **all three** of the following simultaneously:

1. Headline revenue number (and % change vs prior period)
2. Line chart (y-axis values per day)
3. Daily breakdown table (column header + each row's revenue value)

No additional API call is made on toggle — see API design below.

---

## API Changes — `app/api/tiktok/revenue/route.ts`

### Revenue calculation

Replace the existing `calcOrderRevenue()` with two separate functions:

```ts
function calcProductRevenue(order: TikTokOrderDetail): number {
  const p = order.payment;
  return parseFloat(p.original_total_product_price) - parseFloat(p.seller_discount);
}

function calcShippingRevenue(order: TikTokOrderDetail): number {
  return parseFloat(order.payment.shipping_fee ?? '0');
}
```

Fallback: if `original_total_product_price` is missing/zero, fall back to `payment.sub_total` (existing fallback logic preserved).

### Response shape

The route now always returns **both** revenue components per day, so the frontend can combine them client-side without an extra fetch:

```ts
// Per day entry
{
  date: string; // "2026-04-12"
  productRevenue: number;
  shippingRevenue: number;
  orders: number;
}

// Top-level totals (current period + prior period for % change)
{
  totalProductRevenue: number;
  totalShippingRevenue: number;
  totalOrders: number;
  prevTotalProductRevenue: number; // prior period, for % change when toggle=off
  prevTotalShippingRevenue: number; // prior period, for % change when toggle=on
  prevTotalOrders: number;
}
```

---

## Frontend Changes — `components/RevenueSection.tsx`

### State

```ts
const [includeShipping, setIncludeShipping] = useState<boolean>(() => {
  return localStorage.getItem('tiktok-revenue-include-shipping') === 'true';
});
```

On toggle change: update state + write to localStorage.

### Derived values (computed from API response, no extra fetch)

```ts
const revenueForDay = (day) => day.productRevenue + (includeShipping ? day.shippingRevenue : 0);

const totalRevenue = days.reduce((sum, d) => sum + revenueForDay(d), 0);
const label = includeShipping ? 'Gross revenue' : 'Product revenue';
const caption = includeShipping
  ? 'MSRP − seller discounts + buyer shipping · excl. platform discounts'
  : 'MSRP − seller discounts · excl. platform discounts & shipping';
const tooltip = includeShipping
  ? {
      layman:
        'Everything customers paid us — products and shipping — before TikTok subsidised anything.',
      formula:
        'Formula: MSRP − seller discounts + buyer shipping fee. Platform discounts excluded.',
    }
  : {
      layman: 'What customers paid us for the products, before TikTok subsidised anything.',
      formula: 'Formula: MSRP − seller discounts. Platform discounts excluded.',
    };
```

### Toggle component

Rendered in the card header, right-aligned. On click: `setIncludeShipping(v => !v)`.

### Chart

Chart data array maps `days` using `revenueForDay(day)` — automatically reflects toggle.

### Daily breakdown table

Column header: **"Product Revenue"** or **"Gross Revenue"** (matches `label`).  
Each row value: `revenueForDay(day)`.

---

## Files to Modify

| File                              | Change                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `app/api/tiktok/revenue/route.ts` | Replace `calcOrderRevenue` with `calcProductRevenue` + `calcShippingRevenue`; update response shape to include both fields     |
| `components/RevenueSection.tsx`   | Add toggle state + localStorage; derive combined revenue client-side; update label, caption, tooltip, chart data, table column |
| `types/tiktok.ts`                 | No change needed — `original_total_product_price`, `seller_discount`, `shipping_fee` already present in `TikTokPayment`        |

---

## Verification

1. Select "Yesterday" — confirm Product Revenue matches your manual calculation of **RM 817.52**
2. Flip toggle on — confirm Gross Revenue matches **RM 824.62**
3. Check chart y-values change when toggling
4. Check daily table column header and row values change when toggling
5. Reload the page — confirm toggle preference is remembered (localStorage)
6. Switch to "Last 7 days" — confirm both revenue modes recalculate correctly across the period
