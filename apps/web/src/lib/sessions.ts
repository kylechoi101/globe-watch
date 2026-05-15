import type { ExchangeMeta, MarketStatus } from "@globe-watch/shared";

/**
 * Format a UTC timestamp in the exchange's local timezone and return the
 * fields we need for is-open decisions.
 */
function localParts(ts_ms: number, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(ts_ms))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    iso_date: `${parts.year}-${parts.month}-${parts.day}`,
    hhmm: hour * 60 + minute,
    weekday: parts.weekday, // "Mon", "Tue", ...
  };
}

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export function computeStatus(
  ex: ExchangeMeta,
  now_ms: number,
): MarketStatus {
  const { iso_date, hhmm, weekday } = localParts(now_ms, ex.timezone);

  if (weekday === "Sat" || weekday === "Sun") {
    return mkStatus(ex, false, "closed_weekend", iso_date, hhmm, now_ms);
  }

  const holidayIdx = ex.holidays.indexOf(iso_date);
  if (holidayIdx !== -1) {
    return mkStatus(ex, false, "closed_holiday", iso_date, hhmm, now_ms);
  }

  const open = parseHHMM(ex.regular_open);
  const earlyClose = ex.early_closes.find((e) => e.date === iso_date);
  const close = earlyClose ? parseHHMM(earlyClose.close) : parseHHMM(ex.regular_close);

  if (hhmm < open) {
    return mkStatus(ex, false, "closed_pre_hours", iso_date, hhmm, now_ms);
  }
  if (hhmm >= close) {
    return mkStatus(ex, false, "closed_after_hours", iso_date, hhmm, now_ms);
  }
  return mkStatus(ex, true, "open", iso_date, hhmm, now_ms);
}

function mkStatus(
  ex: ExchangeMeta,
  is_open: boolean,
  reason: MarketStatus["reason"],
  iso_date: string,
  hhmm: number,
  now_ms: number,
): MarketStatus {
  return {
    mic: ex.mic,
    is_open,
    reason,
    holiday_name: reason === "closed_holiday" ? `Holiday ${iso_date}` : undefined,
    next_open_utc: estimateNextOpen(ex, now_ms, hhmm),
  };
}

/**
 * Cheap forward-walk: scan the next 7 days for the first non-holiday,
 * non-weekend day and return that day's regular_open in UTC seconds.
 */
function estimateNextOpen(
  ex: ExchangeMeta,
  now_ms: number,
  hhmm_now: number,
): number {
  const openMin = parseHHMM(ex.regular_open);
  let cursor = now_ms;
  // If we're before today's open and today is a normal trading day, that's it.
  const today = localParts(cursor, ex.timezone);
  if (
    today.weekday !== "Sat" &&
    today.weekday !== "Sun" &&
    !ex.holidays.includes(today.iso_date) &&
    hhmm_now < openMin
  ) {
    return localOpenToUtcSeconds(today.iso_date, ex);
  }
  for (let i = 0; i < 10; i++) {
    cursor += 24 * 60 * 60 * 1000;
    const p = localParts(cursor, ex.timezone);
    if (p.weekday === "Sat" || p.weekday === "Sun") continue;
    if (ex.holidays.includes(p.iso_date)) continue;
    return localOpenToUtcSeconds(p.iso_date, ex);
  }
  return Math.floor(now_ms / 1000) + 24 * 3600;
}

/**
 * Convert a local "YYYY-MM-DD HH:MM" in the exchange's timezone to a unix
 * seconds value. Uses an Intl-based offset lookup to avoid pulling in a
 * full timezone library.
 */
function localOpenToUtcSeconds(iso_date: string, ex: ExchangeMeta): number {
  const [y, mo, d] = iso_date.split("-").map(Number);
  const [h, mi] = ex.regular_open.split(":").map(Number);
  // Naive: assume the local wall clock equals the UTC wall clock, then
  // shift by the timezone's current offset (computed at that instant).
  const naive_utc = Date.UTC(y, mo - 1, d, h, mi);
  const offset_min = tzOffsetMinutes(ex.timezone, naive_utc);
  return Math.floor((naive_utc - offset_min * 60 * 1000) / 1000);
}

function tzOffsetMinutes(tz: string, ts_ms: number): number {
  // Compute offset by formatting the same instant in tz and UTC, then
  // diffing the wall-clock representations.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(ts_ms))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const local_as_utc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return Math.round((local_as_utc - ts_ms) / 60_000);
}

export function reasonLabel(s: MarketStatus): string {
  switch (s.reason) {
    case "open": return "Open";
    case "closed_weekend": return "Closed (weekend)";
    case "closed_holiday": return `Closed (${s.holiday_name ?? "holiday"})`;
    case "closed_after_hours": return "Closed (after hours)";
    case "closed_pre_hours": return "Closed (pre-hours)";
  }
}
