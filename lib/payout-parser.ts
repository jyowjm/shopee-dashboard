import * as xlsx from 'xlsx';
import type { PayoutOrderRow, PayoutPeriodMeta } from '@/types/reconciliation';
import { FEE_CONFIG } from '@/lib/fee-config';

// Income sheet column indices (0-based), row 3 = header
const COL = {
  VIEW_BY: 1,
  ORDER_ID: 2,
  PAYOUT_DATE: 7,
  ORDER_TYPE: 9,
  PRODUCT_PRICE: 12,
  REFUND_AMOUNT: 13,
  SHIPPING_FEE: 14, // "Shipping Fee" paid by buyer (excl. SST) — used in transaction base
  VOUCHER_FROM_SELLER: 23,
  COMMISSION_FEE: 27,
  SERVICE_FEE: 28,
  TRANSACTION_FEE: 29,
  // col 30 is an unlabeled raw transaction fee calculation column (skip)
  AMS_FEE: 31,
  AMOUNT_PAID_BUYER: 35,
  TXN_RATE: 36,
  PAYMENT_METHOD: 37,
  // col 38 is PM details (e.g. bank name)
  INSTALLMENT_PLAN: 39,
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
    // When the Service Fee Details sheet doesn't break out platform_support, assume
    // the standard flat fee was charged whenever any service fee appears.
    const platform_support_actual = sf
      ? sf.platform
      : service_fee_actual > 0
        ? FEE_CONFIG.platform_support_fee
        : 0;
    const cashback_actual = Math.max(0, +(service_fee_actual - platform_support_actual).toFixed(2));

    orders.push({
      order_sn,
      payout_date: toDateStr(row[COL.PAYOUT_DATE]),
      product_price: toNum(row[COL.PRODUCT_PRICE]),
      seller_voucher: Math.abs(toNum(row[COL.VOUCHER_FROM_SELLER])),
      shipping_fee_by_buyer: toNum(row[COL.SHIPPING_FEE]),
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
  // API path can't split service_fee into its components; assume the standard flat fee.
  const platform_support_actual = FEE_CONFIG.platform_support_fee;
  const cashback_actual = Math.max(0, +(service_fee_actual - platform_support_actual).toFixed(2));

  const payoutDate = escrow.release_time
    ? new Date(escrow.release_time * 1000).toISOString().substring(0, 10)
    : '';

  return {
    order_sn: escrow.order_sn,
    payout_date: payoutDate,
    product_price: escrow.original_cost_of_goods_sold ?? escrow.buyer_total_amount,
    seller_voucher: Math.abs(escrow.voucher_from_seller ?? 0),
    shipping_fee_by_buyer: 0, // not available via escrow API
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
