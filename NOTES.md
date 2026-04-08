# Shopee Dashboard — Project Notes

A running record of known limitations, open decisions, ideas, and architectural considerations.

---

## Known Limitations

### Revenue section: 500-order API cap
**Status:** Pending decision
**Added:** 2026-04-08

The Revenue section queries the live Shopee API and is capped at 500 orders per request to prevent Vercel function timeouts (60s limit). For date ranges longer than ~6–8 weeks at current order volume, the figures shown (total revenue, paid orders, daily chart) will be understated — only the first 500 orders in the range are counted.

**Implications:**
- Custom date ranges spanning a full quarter or year will be inaccurate
- If daily order volume ever exceeds 500, even a single-day view would be affected
- The dashboard shows a warning banner when the cap is hit

**Options considered (2026-04-08):**
1. Paginate the live API fully — not viable, will always timeout for large ranges
2. Move Revenue to Supabase — fast, scalable, slight freshness lag (~24h from daily sync)
3. Hybrid: Supabase for history + live API for recent gap — most accurate, most complex

**Recommendation:** Option 2 (Supabase). The dashboard is primarily an analysis tool; sub-24h freshness is acceptable. A "last synced" label would make staleness transparent.

**Decision:** Deferred — revisit when order volume approaches the limit or when yearly analysis is needed.

---

## Architecture Decisions

### Data sources
- **Orders / Customers / Locations:** Supabase (`orders` table), populated via daily cron sync + one-time backfill + XLSX report uploads
- **Revenue:** Live Shopee API (see limitation above)
- **Products / Ads:** Live Shopee API

### Address data
Shopee masks recipient addresses in the API response for MY orders (`"****"`). Real addresses only come from downloaded XLSX order reports. Reports must be uploaded manually via `/upload` to populate location data in the database.

### `data_source` field
Each order row tracks where its data came from: `'api'`, `'report'`, or `'both'`. API syncs preserve address fields set by report uploads; report uploads preserve `buyer_user_id` set by API syncs.

### Daily sync strategy
The cron job (`/api/cron/sync-customers`, runs 2am MYT) uses two windows:
- **New orders:** `create_time` watermark from last sync to now
- **Status updates:** 30-day rolling `update_time` window to catch late status changes

---

## Ideas / Future Improvements

- Consider adding a "last synced" timestamp to Revenue section so staleness is visible
- Explore moving Revenue to Supabase once the 500-order cap becomes a real constraint
- Automated report ingestion (e.g. email/FTP polling) to remove the manual upload step

### Quarter and Year timeframe presets
**Added:** 2026-04-08

Add "This quarter", "Last quarter", "This year" presets to the TimeFilter. The delta badge comparison period needs to be decided before implementation:

- **This quarter** — detect current calendar quarter from today's date (e.g. Apr 8 = Q2, so show Apr 1–Apr 8). Delta options: vs same period in previous quarter (Jan 1–Jan 8), or vs same period in Q2 last year (Apr 1–Apr 8, 2025)?
- **Last quarter** — show the full previous calendar quarter. Delta options: vs the quarter before it, or vs the same quarter last year?
- **This year** — show Jan 1 to today. Delta presumably vs same period last year (Jan 1–Apr 8, 2025).

The `preset` param system already exists in the route and TimeFilter — new presets just need to be tagged and handled with `subQuarters`/`subYears` from `date-fns`. Decision on delta comparison period needed before implementing.

---

## Open Questions

- None currently

---

*Last updated: 2026-04-08 (2)*
