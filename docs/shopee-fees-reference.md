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
