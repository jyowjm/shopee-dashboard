# Shopee Malaysia Fee Reference — Local Marketplace Sellers

> Last updated: 2026-04-09
> Source articles: [3503](https://seller.shopee.com.my/edu/article/3503) · [6799](https://seller.shopee.com.my/edu/article/6799) · [1094](https://seller.shopee.com.my/edu/article/1094) · [16038](https://seller.shopee.com.my/edu/article/16038) · [5161](https://seller.shopee.com.my/edu/article/5161) · [25269](https://seller.shopee.com.my/edu/article/25269) · [1096](https://seller.shopee.com.my/edu/article/1096)
>
> **When Shopee changes a rate:** Update this document AND `lib/fee-config.ts` together.

---

## Calculation Bases

Different fees use different bases. All bases start from the payout report's **"Product Price"** column, which is the deal price _after item rebates_ but _before_ seller vouchers.

| Fee                | Base Formula                                                  |
| ------------------ | ------------------------------------------------------------- |
| Commission         | `product_price − seller_voucher`                              |
| Cashback Programme | `product_price − seller_voucher`                              |
| Transaction        | `product_price − seller_voucher + shipping_fee_paid_by_buyer` |
| AMS                | `product_price − seller_voucher`                              |

**Column mapping (payout report Income sheet):**

- `product_price` — col 12 ("Product Price")
- `seller_voucher` — col 23 ("Voucher Sponsored by Seller"), take absolute value
- `shipping_fee_paid_by_buyer` — col 14 ("Shipping Fee Paid by Buyer (excl. SST)")

**Not included in any base:** Shopee-sponsored rebates, coins, payment channel promotions.

---

## 1. Marketplace Commission Fee

**Applies to:** All local Marketplace sellers (not Shopee Mall)
**When charged:** Per completed order. New sellers exempt until >100 completed orders OR >120 days since first listing (whichever comes first).

**Formula:**

```
commission = ROUND(base × commission_rate × 1.08, 2)
```

**Rate:** Varies by product category and Cashback Programme participation. Configured in `lib/fee-config.ts`.

| Category                           | Non-Cashback Rate (pre-SST) | Cashback Rate (pre-SST)            |
| ---------------------------------- | --------------------------- | ---------------------------------- |
| Health & Beauty / Supplements      | ~11%                        | ~10.5% (verify with Seller Centre) |
| _(add other categories as needed)_ |                             |                                    |

**SST:** 8% added on top of the pre-SST rate.

**Effective date of current rate:** 1 February 2026

---

## 2. Transaction Fee

**Applies to:** All completed orders across Marketplace and Mall.

**Formula:**

```
transaction_fee = ROUND(transaction_base × rate_pre_sst × 1.08, 2)
```

where `transaction_base = product_price − seller_voucher + shipping_fee_paid_by_buyer`

**Standard rates (effective 1 Feb 2026, pre-SST):**

| Payment Method         | Pre-SST Rate | Incl. SST |
| ---------------------- | ------------ | --------- |
| Online Banking         | 3.50%        | 3.78%     |
| Credit / Debit Card    | 3.50%        | 3.78%     |
| ShopeePay Balance      | 3.50%        | 3.78%     |
| Cash on Delivery (COD) | 3.50%        | 3.78%     |

**SPayLater rates (effective 1 Feb 2026, pre-SST):**

| Installment Plan | Pre-SST Rate | Incl. SST |
| ---------------- | ------------ | --------- |
| 1x (Pay Later)   | 4.50%        | 4.86%     |
| 3x               | 5.00%        | 5.40%     |
| 6x               | 4.50%        | 4.86%     |
| 12x              | 4.50%        | 4.86%     |
| 18x              | 4.50%        | 4.86%     |
| 24x              | 4.50%        | 4.86%     |
| 36x              | 4.50%        | 4.86%     |
| 48x              | 4.50%        | 4.86%     |

**Credit Card Instalment (CCI) rates (pre-SST):**

| Installment Plan | Pre-SST Rate | Incl. SST |
| ---------------- | ------------ | --------- |
| 3x               | 3.50%        | 3.78%     |
| 6x               | 4.00%        | 4.32%     |
| 12x              | 5.00%        | 5.40%     |
| 18x              | 6.00%        | 6.48%     |
| 24x              | 6.50%        | 7.02%     |
| 36x              | 7.50%        | 8.10%     |

**Note:** The payout report "Transaction Fee Rate (%)" column (col 36) shows the inclusive (post-SST) rate used per order.

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

## 4. Cashback Programme Service Fee _(optional — if seller is enrolled)_

**Applies to:** Sellers enrolled in the Shopee Cashback Programme, charged on all completed orders regardless of whether the buyer used the cashback voucher.

**Formula:**

```
cashback_fee = MIN(ROUND(base × rate × 1.08, 2), 108.00)
```

**Rates (pre-SST):**

| Day type         | Pre-SST Rate | Incl. SST | Cap (incl. SST) |
| ---------------- | ------------ | --------- | --------------- |
| Non-campaign day | 5.5%         | 5.94%     | RM108.00/item   |
| Campaign day     | 7.5%         | 8.10%     | RM108.00/item   |

**Campaign days:** Double-Digit days (1.1, 2.2, ... 12.12), Mid-month sales, Payday sales. Campaign period: 8pm on D-1 through 11:59pm on D-day.

**Note:** The payout report "Service Fee" column combines Platform Support Fee + Cashback Programme Fee. The "Service Fee Details" sheet shows the split per order.

**Activation:** Applications processed weekly (cut-off Tuesday 5PM, activated following Wednesday 12AM). Minimum 28-day commitment before opt-out.

---

## 5. AMS Commission Fee _(optional — ads-attributed orders only)_

**Applies to:** Orders attributed to Shopee Affiliate Marketing Solution (AMS) campaigns.
**Effective:** 20 January 2026

**Formulas:**

| Order Type     | Formula                                                   |
| -------------- | --------------------------------------------------------- |
| Direct Order   | `ROUND(purchase_value × commission_rate × 1.08, 2)`       |
| Indirect Order | `ROUND(purchase_value × commission_rate × 30% × 1.08, 2)` |

where `purchase_value = product_price − seller_voucher` (same base as commission fee).

- **Direct orders**: Buyer clicked an affiliate link to your product directly.
- **Indirect orders**: Buyer found your product via an affiliate link to a different shop/product. Shopee applies a 30% multiplier to your configured rate.

**Purchase value base** = `deal_price_subtotal − seller_voucher − shopee_voucher`
(Shopee allocates this net value across items proportionally before applying rates.)

**Primary reconciliation source:** `GET /api/v2/ams/get_conversion_report`

Filter parameters:

- `ams_deduction_time_start` / `ams_deduction_time_end` — payout period timestamps (MYT = UTC+8)
- `deduction_status=Deducted` — only orders where the fee was actually charged
- `deduction_method=OrderEscrow` — matches entries in the payout report

`order_brand_commission` is the **pre-SST** total commission for the order. Apply SST to get
the expected payout deduction:

```
ams_expected = ROUND(order_brand_commission × 1.08, 2)
```

This equals the sum of `Expense(RM)` per-item in the Seller Conversion Report CSV.

**Fallback (when API unavailable):** `ROUND(purchase_value × ams_commission_rate × 1.08, 2)` using the default rate from `lib/fee-config.ts`. Does not account for per-product rates, indirect-order reductions, or Shopee-sponsored vouchers in the base.

---

## 6. Unsuccessful Order Fee _(returns/refunds only)_

**Applies to:** Orders that go through a refund or return & refund process (from 9 May 2022 onwards).

**Components:**

- **Forward Shipping Fee (FSF):** `CEIL(actual_shipping_fee − shopee_shipping_rebate, 2)` — charged when seller is at fault
- **Return Shipping Fee (RSF):** Actual return logistics cost — charged when physical return occurs

**SST:** 6% SST added on top of FSF and RSF.

**Not charged when:** Refund reason is Non-Receipt (outside seller's control).

**Reconciliation:** These fees cannot be predicted from a formula. Actuals are accepted from the payout report.

---

## Change Log

| Date       | Change                                                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-09 | AMS: added SST, direct/indirect formula, conversion report API source; fixed SST bug in engine fallback                                                                      |
| 2026-04-09 | Corrected fee calculation bases (subtract seller_voucher; add shipping for transaction); added full SPayLater + CCI rate tables; documented Income sheet column index offset |
| 2026-04-08 | Initial document created                                                                                                                                                     |
| 2026-02-01 | Marketplace commission fee adjusted (Shopee update)                                                                                                                          |
| 2025-07-16 | Platform Support Fee introduced at RM0.54/order                                                                                                                              |
