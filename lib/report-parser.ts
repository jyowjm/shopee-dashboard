import * as xlsx from 'xlsx';
import type { DbOrderRow, DbItemRow } from '@/types/db';

// Shopee report dates are in Malaysia time (UTC+8)
function parseReportDate(val: unknown): string | null {
  if (!val || typeof val !== 'string' || !val.trim()) return null;
  // Format: "2026-03-01 01:35" — treat as MYT (UTC+8)
  const d = new Date(val.trim().replace(' ', 'T') + ':00+08:00');
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function normaliseStatus(raw: unknown): string {
  if (typeof raw !== 'string') return 'UNKNOWN';
  return raw.trim().toUpperCase().replace(/ /g, '_');
}

type RawRow = Record<string, unknown>;

// TikTok Shop order status → normalized status string
const TIKTOK_STATUS_MAP: Record<string, string> = {
  Completed: 'COMPLETED',
  Delivered: 'COMPLETED',
  Shipped: 'SHIPPED',
  'In Transit': 'SHIPPED',
  'Awaiting Shipment': 'READY_TO_SHIP',
  'Awaiting Collection': 'READY_TO_SHIP',
  Unpaid: 'UNPAID',
  Cancelled: 'CANCELLED',
  'Partially Refunded': 'TO_RETURN',
};

/**
 * Detect whether a parsed sheet's header row looks like a TikTok Shop report.
 * TikTok reports have an "Order ID" column and "Order Status" but also "Seller SKU"
 * and no "Username (Buyer)" column (which is Shopee-specific).
 */
function isTikTokReport(keys: string[]): boolean {
  const has = (k: string) => keys.some((h) => h.toLowerCase().includes(k.toLowerCase()));
  return has('Order ID') && has('Seller SKU') && !has('Username (Buyer)');
}

function parseTikTokReport(rawRows: RawRow[]): { orders: DbOrderRow[]; items: DbItemRow[] } {
  const orderMap = new Map<string, { orderRow: DbOrderRow; items: DbItemRow[] }>();

  for (const row of rawRows) {
    const orderId = String(row['Order ID'] ?? row['Order Id'] ?? '').trim();
    if (!orderId) continue;

    if (!orderMap.has(orderId)) {
      const rawStatus = String(row['Order Status'] ?? '').trim();
      const status = TIKTOK_STATUS_MAP[rawStatus] ?? normaliseStatus(rawStatus);

      orderMap.set(orderId, {
        orderRow: {
          order_sn: orderId,
          platform: 'tiktok',
          buyer_user_id: null,
          tiktok_buyer_uid: String(row['Buyer UID'] ?? row['Buyer User ID'] ?? '').trim() || null,
          order_status: status,
          create_time:
            parseReportDate(row['Order Creation Time'] ?? row['Created Time']) ??
            new Date(0).toISOString(),
          pay_time: parseReportDate(row['Paid Time'] ?? row['Payment Time']),
          order_complete_time: parseReportDate(
            row['Order Complete Time'] ?? row['Completion Time'],
          ),
          ship_time: parseReportDate(row['Ship Time'] ?? row['Shipped Time']),
          total_amount: parseNum(row['Order Amount'] ?? row['Total Amount']),
          shipping_carrier:
            String(row['Shipping Provider Name'] ?? row['Logistics Provider'] ?? '').trim() || null,
          tracking_number:
            String(row['Tracking Number'] ?? row['Tracking ID'] ?? '').trim() || null,
          buyer_username:
            String(row['Buyer Username'] ?? row['Buyer Nickname'] ?? '').trim() || null,
          recipient_name:
            String(row['Recipient Name'] ?? row['Receiver Name'] ?? '').trim() || null,
          recipient_phone:
            String(row['Phone Number'] ?? row['Recipient Phone'] ?? '').trim() || null,
          recipient_state: String(row['State'] ?? row['Province'] ?? '').trim() || null,
          recipient_city: String(row['City'] ?? '').trim() || null,
          recipient_district: String(row['District'] ?? '').trim() || null,
          recipient_zipcode: String(row['Zip Code'] ?? row['Postal Code'] ?? '').trim() || null,
          cancel_reason: String(row['Cancel Reason'] ?? '').trim() || null,
          return_refund_status: String(row['Return / Refund Status'] ?? '').trim() || null,
        },
        items: [],
      });
    }

    const entry = orderMap.get(orderId)!;
    entry.items.push({
      order_sn: orderId,
      item_name: String(row['Product Name'] ?? '').trim() || null,
      item_sku: String(row['Seller SKU'] ?? '').trim() || null,
      model_sku: String(row['SKU ID'] ?? '').trim() || null,
      model_name: String(row['Variation'] ?? row['SKU Name'] ?? '').trim() || null,
      model_original_price: parseNum(row['Original Price']),
      model_discounted_price: parseNum(row['SKU Unit Original Price'] ?? row['Sale Price']),
      model_quantity_purchased: parseNum(row['Quantity']),
      total_buyer_payment: parseNum(row['Subtotal'] ?? row['Total Price']),
    });
  }

  const orders: DbOrderRow[] = [];
  const items: DbItemRow[] = [];
  for (const { orderRow, items: orderItems } of orderMap.values()) {
    orders.push(orderRow);
    items.push(...orderItems);
  }
  return { orders, items };
}

export function parseOrderReport(buffer: Buffer): { orders: DbOrderRow[]; items: DbItemRow[] } {
  const wb = xlsx.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = xlsx.utils.sheet_to_json<RawRow>(ws);

  if (!rawRows.length) return { orders: [], items: [] };

  // Auto-detect platform from header columns
  const keys = Object.keys(rawRows[0]);
  if (isTikTokReport(keys)) {
    return parseTikTokReport(rawRows);
  }

  // ── Shopee report ──────────────────────────────────────────────────────────

  // Group rows by Order ID — one row per item line
  const orderMap = new Map<string, { orderRow: DbOrderRow; items: DbItemRow[] }>();

  for (const row of rawRows) {
    const orderSn = String(row['Order ID'] ?? '').trim();
    if (!orderSn) continue;

    if (!orderMap.has(orderSn)) {
      const status = normaliseStatus(row['Order Status']);
      orderMap.set(orderSn, {
        orderRow: {
          order_sn: orderSn,
          platform: 'shopee',
          buyer_user_id: null, // not in report; filled by API sync
          order_status: status,
          cancel_reason: String(row['Cancel reason'] ?? '').trim() || null,
          return_refund_status: String(row['Return / Refund Status'] ?? '').trim() || null,
          tracking_number: String(row['Tracking Number*'] ?? '').trim() || null,
          shipping_carrier: String(row['Shipping Option'] ?? '').trim() || null,
          shipment_method: String(row['Shipment Method'] ?? '').trim() || null,
          ship_by_date: parseReportDate(row['Estimated Ship Out Date']),
          ship_time: parseReportDate(row['Ship Time']),
          create_time: parseReportDate(row['Order Creation Date']) ?? new Date(0).toISOString(),
          pay_time: parseReportDate(row['Order Paid Time']),
          order_complete_time: parseReportDate(row['Order Complete Time']),
          total_amount: parseNum(row['Total Amount']),
          estimated_shipping_fee: parseNum(row['Estimated Shipping Fee']),
          buyer_username: String(row['Username (Buyer)'] ?? '').trim() || null,
          recipient_name: String(row['Receiver Name'] ?? '').trim() || null,
          recipient_phone: String(row['Phone Number'] ?? '').trim() || null,
          recipient_town: String(row['Town'] ?? '').trim() || null,
          recipient_district: String(row['District'] ?? '').trim() || null,
          recipient_city: String(row['City'] ?? '').trim() || null,
          recipient_state: String(row['Province'] ?? '').trim() || null,
          recipient_region: String(row['Country'] ?? '').trim() || null,
          recipient_zipcode: String(row['Zip Code'] ?? '').trim() || null,
          message_to_seller: String(row['Remark from buyer'] ?? '').trim() || null,
        },
        items: [],
      });
    }

    const entry = orderMap.get(orderSn)!;
    entry.items.push({
      order_sn: orderSn,
      item_name: String(row['Product Name'] ?? '').trim() || null,
      item_sku: String(row['Parent SKU Reference No.'] ?? '').trim() || null,
      model_sku: String(row['SKU Reference No.'] ?? '').trim() || null,
      model_name: String(row['Variation Name'] ?? '').trim() || null,
      model_original_price: parseNum(row['Original Price']),
      model_discounted_price: parseNum(row['Deal Price']),
      model_quantity_purchased: parseNum(row['Quantity']),
      returned_quantity: parseNum(row['Returned quantity']),
      total_buyer_payment: parseNum(row['Total Buyer Payment']),
      voucher_code: String(row['Voucher Code'] ?? '').trim() || null,
    });
  }

  const orders: DbOrderRow[] = [];
  const items: DbItemRow[] = [];

  for (const { orderRow, items: orderItems } of orderMap.values()) {
    orders.push(orderRow);
    items.push(...orderItems);
  }

  return { orders, items };
}
