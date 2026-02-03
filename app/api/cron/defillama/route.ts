import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFILLAMA_BASE = process.env.DEFILLAMA_BASE_URL || "https://pro-api.llama.fi";
const DEFILLAMA_KEY = process.env.DEFILLAMA_API_KEY || "";
const DEFILLAMA_KEY_IN_PATH = (process.env.DEFILLAMA_KEY_IN_PATH || "true").toLowerCase() !== "false";

const COINGECKO_BASE = process.env.COINGECKO_BASE_URL || "https://pro-api.coingecko.com/api/v3";
const COINGECKO_KEY = process.env.COINGECKO_API_KEY || "";
const COINGECKO_HEADER = process.env.COINGECKO_API_HEADER || "x-cg-pro-api-key";

const DERIV_TOP_N = Math.max(1, Number.parseInt(process.env.DERIVATIVES_TOP_N || "50", 10));
const LOOKBACK_DAYS = Math.max(1, Number.parseInt(process.env.DERIVATIVES_LOOKBACK_DAYS || "90", 10));
const WINDOWS = (process.env.DERIVATIVES_WINDOWS || "7,30,90")
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0);

const BLOB_PREFIX = process.env.BLOB_PATH_PREFIX || "defillama/derived";

type ProtocolMeta = {
  slug: string;
  name: string;
  coin_id?: string | null;
  coin_symbol?: string | null;
  coin_name?: string | null;
};

type DailyRow = {
  date: string;
  protocol_slug: string;
  protocol_name: string;
  coin_id?: string | null;
  coin_symbol?: string | null;
  coin_name?: string | null;
  fees?: number | null;
  revenue?: number | null;
  volume?: number | null;
  open_interest?: number | null;
  market_cap?: number | null;
  fdv?: number | null;
  fee_per_million_volume?: number | null;
  revenue_per_million_volume?: number | null;
  take_rate?: number | null;
  market_cap_per_volume?: number | null;
  fdv_per_volume?: number | null;
  oi_per_volume?: number | null;
  fee_per_open_interest?: number | null;
  revenue_per_open_interest?: number | null;
};

type WindowRow = DailyRow & { window_days: number };

const ensureAuthorized = (request: Request) => {
  const cronHeader = request.headers.get("x-vercel-cron");
  if (cronHeader === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
};

const toDateKey = (tsSeconds: number) => {
  const dt = new Date(tsSeconds * 1000);
  return dt.toISOString().slice(0, 10);
};

const cutoffDate = () => {
  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - (LOOKBACK_DAYS - 1));
  return cutoff.toISOString().slice(0, 10);
};

const safeNumber = (value: unknown) => (typeof value === "number" ? value : null);

const safeDivide = (numer?: number | null, denom?: number | null) => {
  if (typeof numer !== "number" || typeof denom !== "number") return null;
  if (!Number.isFinite(numer) || !Number.isFinite(denom) || denom <= 0) return null;
  return numer / denom;
};

const escapeCsv = (value: unknown) => {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  if (raw.includes("\n") || raw.includes(",") || raw.includes('"')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

const toCsv = (rows: Array<Record<string, unknown>>, columns: string[]) => {
  const header = columns.join(",");
  const lines = rows.map((row) => columns.map((col) => escapeCsv(row[col])).join(","));
  return [header, ...lines].join("\n");
};

const defillamaFetch = async (path: string, params?: Record<string, string>) => {
  if (!DEFILLAMA_KEY) {
    throw new Error("Missing DEFILLAMA_API_KEY");
  }
  const base = DEFILLAMA_BASE.replace(/\/$/, "");
  const withKey = DEFILLAMA_KEY_IN_PATH ? `${base}/${DEFILLAMA_KEY}${path}` : `${base}${path}`;
  const url = new URL(withKey);
  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  }
  const headers = DEFILLAMA_KEY_IN_PATH ? undefined : { "x-api-key": DEFILLAMA_KEY };
  const res = await fetch(url.toString(), { headers, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`DefiLlama ${path} failed: ${res.status}`);
  }
  return (await res.json()) as any;
};

const coingeckoFetch = async (path: string, params?: Record<string, string>) => {
  if (!COINGECKO_KEY) {
    throw new Error("Missing COINGECKO_API_KEY");
  }
  const base = COINGECKO_BASE.replace(/\/$/, "");
  const url = new URL(`${base}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  }
  const res = await fetch(url.toString(), {
    headers: { [COINGECKO_HEADER]: COINGECKO_KEY },
    cache: "no-store"
  });
  if (!res.ok) {
    throw new Error(`CoinGecko ${path} failed: ${res.status}`);
  }
  return (await res.json()) as any;
};

const mapLimit = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) => {
  const results: R[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }).map(async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
};

const parseBreakdown = (
  breakdown: any,
  slugByName: Map<string, string>,
  validSlugs: Set<string>
) => {
  const cutoff = cutoffDate();
  const result: Record<string, Record<string, number>> = {};
  if (!Array.isArray(breakdown)) return result;
  for (const entry of breakdown) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const ts = entry[0];
    const values = entry[1];
    if (typeof ts !== "number" || !values || typeof values !== "object") continue;
    const dateKey = toDateKey(ts);
    if (dateKey < cutoff) continue;
    for (const [key, raw] of Object.entries(values)) {
      const slug =
        slugByName.get(key) ||
        slugByName.get(key.toLowerCase()) ||
        (validSlugs.has(key) ? key : null);
      if (!slug || !validSlugs.has(slug)) continue;
      const value = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(value)) continue;
      result[slug] = result[slug] || {};
      result[slug][dateKey] = (result[slug][dateKey] || 0) + value;
    }
  }
  return result;
};

const buildDailyRows = (
  protocols: Map<string, ProtocolMeta>,
  fees: Record<string, Record<string, number>>,
  revenue: Record<string, Record<string, number>>,
  volume: Record<string, Record<string, number>>,
  openInterest: Record<string, Record<string, number | null>>,
  marketCaps: Map<string, { market_cap: number | null; fdv: number | null }>
) => {
  const rows: DailyRow[] = [];
  for (const [slug, meta] of protocols.entries()) {
    const dates = new Set<string>();
    Object.keys(fees[slug] || {}).forEach((date) => dates.add(date));
    Object.keys(revenue[slug] || {}).forEach((date) => dates.add(date));
    Object.keys(volume[slug] || {}).forEach((date) => dates.add(date));
    Object.keys(openInterest[slug] || {}).forEach((date) => dates.add(date));

    const sortedDates = Array.from(dates).sort();
    const market = meta.coin_id ? marketCaps.get(meta.coin_id) : undefined;

    for (const date of sortedDates) {
      const feesVal = fees[slug]?.[date] ?? null;
      const revVal = revenue[slug]?.[date] ?? null;
      const volVal = volume[slug]?.[date] ?? null;
      const oiVal = openInterest[slug]?.[date] ?? null;
      const marketCap = market?.market_cap ?? null;
      const fdv = market?.fdv ?? null;

      const row: DailyRow = {
        date,
        protocol_slug: slug,
        protocol_name: meta.name,
        coin_id: meta.coin_id || null,
        coin_symbol: meta.coin_symbol || null,
        coin_name: meta.coin_name || null,
        fees: feesVal,
        revenue: revVal,
        volume: volVal,
        open_interest: oiVal,
        market_cap: marketCap,
        fdv
      };

      row.fee_per_million_volume = safeDivide(row.fees, row.volume);
      if (row.fee_per_million_volume !== null) {
        row.fee_per_million_volume *= 1_000_000;
      }
      row.revenue_per_million_volume = safeDivide(row.revenue, row.volume);
      if (row.revenue_per_million_volume !== null) {
        row.revenue_per_million_volume *= 1_000_000;
      }
      row.take_rate = safeDivide(row.fees, row.volume);
      row.market_cap_per_volume = safeDivide(row.market_cap, row.volume);
      row.fdv_per_volume = safeDivide(row.fdv, row.volume);
      row.oi_per_volume = safeDivide(row.open_interest, row.volume);
      row.fee_per_open_interest = safeDivide(row.fees, row.open_interest);
      row.revenue_per_open_interest = safeDivide(row.revenue, row.open_interest);

      rows.push(row);
    }
  }
  return rows.sort((a, b) => (a.protocol_slug === b.protocol_slug ? a.date.localeCompare(b.date) : a.protocol_slug.localeCompare(b.protocol_slug)));
};

const buildWindowRows = (dailyRows: DailyRow[], windows: number[]) => {
  const rows: WindowRow[] = [];
  const bySlug = new Map<string, DailyRow[]>();
  for (const row of dailyRows) {
    if (!bySlug.has(row.protocol_slug)) bySlug.set(row.protocol_slug, []);
    bySlug.get(row.protocol_slug)!.push(row);
  }

  for (const [slug, group] of bySlug.entries()) {
    const sorted = group.slice().sort((a, b) => a.date.localeCompare(b.date));
    for (const window of windows) {
      for (let i = 0; i < sorted.length; i++) {
        if (i + 1 < window) continue;
        const slice = sorted.slice(i + 1 - window, i + 1);
        const sumMetric = (key: keyof DailyRow) => {
          const values = slice.map((row) => row[key]).filter((val): val is number => typeof val === "number" && Number.isFinite(val));
          if (!values.length) return null;
          return values.reduce((acc, val) => acc + val, 0);
        };
        const meanMetric = (key: keyof DailyRow) => {
          const values = slice.map((row) => row[key]).filter((val): val is number => typeof val === "number" && Number.isFinite(val));
          if (!values.length) return null;
          return values.reduce((acc, val) => acc + val, 0) / values.length;
        };

        const fees = sumMetric("fees");
        const revenue = sumMetric("revenue");
        const volume = sumMetric("volume");
        const openInterest = meanMetric("open_interest");
        const marketCap = meanMetric("market_cap");
        const fdv = sorted[i].fdv ?? null;

        const base = sorted[i];
        const row: WindowRow = {
          ...base,
          window_days: window,
          fees,
          revenue,
          volume,
          open_interest: openInterest,
          market_cap: marketCap,
          fdv
        };

        row.fee_per_million_volume = safeDivide(fees, volume);
        if (row.fee_per_million_volume !== null) {
          row.fee_per_million_volume *= 1_000_000;
        }
        row.revenue_per_million_volume = safeDivide(revenue, volume);
        if (row.revenue_per_million_volume !== null) {
          row.revenue_per_million_volume *= 1_000_000;
        }
        row.take_rate = safeDivide(fees, volume);
        row.market_cap_per_volume = safeDivide(marketCap, volume);
        row.fdv_per_volume = safeDivide(fdv, volume);
        row.oi_per_volume = safeDivide(openInterest, volume);
        row.fee_per_open_interest = safeDivide(fees, openInterest);
        row.revenue_per_open_interest = safeDivide(revenue, openInterest);

        rows.push(row);
      }
    }
  }

  return rows.sort((a, b) => {
    if (a.protocol_slug === b.protocol_slug) {
      if (a.window_days === b.window_days) {
        return a.date.localeCompare(b.date);
      }
      return a.window_days - b.window_days;
    }
    return a.protocol_slug.localeCompare(b.protocol_slug);
  });
};

const chunk = <T,>(items: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

export async function GET(request: Request) {
  if (!ensureAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [derivativesOverview, feesOverview, revenueOverview, protocolsOverview] = await Promise.all([
      defillamaFetch("/api/overview/derivatives"),
      defillamaFetch("/api/overview/fees", { dataType: "dailyFees" }),
      defillamaFetch("/api/overview/fees", { dataType: "dailyRevenue" }),
      defillamaFetch("/api/protocols")
    ]);

    const slugByName = new Map<string, string>();
    const nameBySlug = new Map<string, string>();
    const derivativesSet = new Set<string>();

    const protocolsRaw = derivativesOverview?.protocols;
    if (Array.isArray(protocolsRaw)) {
      for (const item of protocolsRaw) {
        if (!item || typeof item !== "object") continue;
        const slug = item.slug || item.id || item.name;
        if (!slug) continue;
        const name = item.name || item.displayName || slug;
        derivativesSet.add(slug);
        slugByName.set(name, slug);
        slugByName.set(name.toLowerCase(), slug);
        nameBySlug.set(slug, name);
      }
    } else if (protocolsRaw && typeof protocolsRaw === "object") {
      for (const [slug, info] of Object.entries(protocolsRaw)) {
        const name = (info as any)?.name || slug;
        derivativesSet.add(slug);
        slugByName.set(name, slug);
        slugByName.set(name.toLowerCase(), slug);
        nameBySlug.set(slug, name);
      }
    }

    if (!derivativesSet.size) {
      throw new Error("No derivatives protocols resolved.");
    }

    const feesData = parseBreakdown(feesOverview?.totalDataChartBreakdown, slugByName, derivativesSet);
    const revenueData = parseBreakdown(revenueOverview?.totalDataChartBreakdown, slugByName, derivativesSet);
    const volumeData = parseBreakdown(
      derivativesOverview?.totalDataChartBreakdown,
      slugByName,
      derivativesSet
    );

    const volumeTotals = Object.entries(volumeData).map(([slug, series]) => {
      const total = Object.values(series).reduce((acc, val) => acc + (Number.isFinite(val) ? val : 0), 0);
      return { slug, total };
    });

    const topDerivs = volumeTotals
      .sort((a, b) => b.total - a.total)
      .slice(0, DERIV_TOP_N)
      .map((item) => item.slug);

    const openInterestData: Record<string, Record<string, number | null>> = {};
    await mapLimit(topDerivs, 5, async (slug) => {
      try {
        const payload = await defillamaFetch(`/api/summary/derivatives/${encodeURIComponent(slug)}`);
        const daily = payload?.dailyVolume;
        if (!Array.isArray(daily)) return;
        const cutoff = cutoffDate();
        for (const point of daily) {
          if (!point || typeof point !== "object") continue;
          const ts = point.date;
          if (typeof ts !== "number") continue;
          const dateKey = toDateKey(ts);
          if (dateKey < cutoff) continue;
          const openInterest = safeNumber(point.openInterest);
          if (openInterest === null) continue;
          openInterestData[slug] = openInterestData[slug] || {};
          openInterestData[slug][dateKey] = openInterest;
        }
      } catch (error) {
        console.warn(`Open interest fetch failed for ${slug}:`, error);
      }
    });

    const protocolMeta = new Map<string, ProtocolMeta>();
    const protocolsList = Array.isArray(protocolsOverview)
      ? protocolsOverview
      : protocolsOverview?.protocols || [];
    for (const item of protocolsList) {
      if (!item || typeof item !== "object") continue;
      const slug = item.slug || item.id || item.name;
      if (!slug || !derivativesSet.has(slug)) continue;
      protocolMeta.set(slug, {
        slug,
        name: item.name || item.displayName || slug,
        coin_id: item.gecko_id || null,
        coin_symbol: item.symbol || item.tokenSymbol || null,
        coin_name: item.name || null
      });
    }

    for (const slug of derivativesSet) {
      if (!protocolMeta.has(slug)) {
        protocolMeta.set(slug, {
          slug,
          name: nameBySlug.get(slug) || slug,
          coin_id: null,
          coin_symbol: null,
          coin_name: null
        });
      }
    }

    const geckoIds = Array.from(
      new Set(
        Array.from(protocolMeta.values())
          .map((meta) => meta.coin_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    const marketCaps = new Map<string, { market_cap: number | null; fdv: number | null }>();
    for (const batch of chunk(geckoIds, 200)) {
      if (!batch.length) continue;
      const payload = await coingeckoFetch("/coins/markets", {
        vs_currency: "usd",
        ids: batch.join(",")
      });
      if (!Array.isArray(payload)) continue;
      for (const entry of payload) {
        if (!entry?.id) continue;
        marketCaps.set(entry.id, {
          market_cap: safeNumber(entry.market_cap),
          fdv: safeNumber(entry.fully_diluted_valuation)
        });
      }
    }

    const dailyRows = buildDailyRows(protocolMeta, feesData, revenueData, volumeData, openInterestData, marketCaps);
    const windowRows = buildWindowRows(dailyRows, WINDOWS.length ? WINDOWS : [7, 30, 90]);

    const dailyColumns = [
      "date",
      "protocol_slug",
      "protocol_name",
      "coin_id",
      "coin_symbol",
      "coin_name",
      "fees",
      "revenue",
      "volume",
      "open_interest",
      "market_cap",
      "fdv",
      "fee_per_million_volume",
      "revenue_per_million_volume",
      "take_rate",
      "market_cap_per_volume",
      "fdv_per_volume",
      "oi_per_volume",
      "fee_per_open_interest",
      "revenue_per_open_interest"
    ];

    const windowColumns = [
      ...dailyColumns.slice(0, 1),
      "window_days",
      ...dailyColumns.slice(1)
    ];

    const dailyCsv = toCsv(dailyRows, dailyColumns);
    const windowCsv = toCsv(windowRows, windowColumns);

    const [dailyBlob, windowBlob] = await Promise.all([
      put(`${BLOB_PREFIX}/volume_efficiency_daily.csv`, dailyCsv, {
        access: "public",
        contentType: "text/csv"
      }),
      put(`${BLOB_PREFIX}/volume_efficiency_windows.csv`, windowCsv, {
        access: "public",
        contentType: "text/csv"
      })
    ]);

    return NextResponse.json({
      ok: true,
      derivatives: derivativesSet.size,
      daily_rows: dailyRows.length,
      window_rows: windowRows.length,
      daily_url: dailyBlob.url,
      windows_url: windowBlob.url
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
