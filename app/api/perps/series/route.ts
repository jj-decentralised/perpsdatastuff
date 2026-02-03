import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFILLAMA_BASE = process.env.DEFILLAMA_BASE_URL || "https://pro-api.llama.fi";
const DEFILLAMA_KEY = process.env.DEFILLAMA_API_KEY || "";
const DEFILLAMA_KEY_IN_PATH = (process.env.DEFILLAMA_KEY_IN_PATH || "true").toLowerCase() !== "false";

const COINGECKO_BASE = process.env.COINGECKO_BASE_URL || "https://pro-api.coingecko.com/api/v3";
const COINGECKO_KEY = process.env.COINGECKO_API_KEY || "";
const COINGECKO_HEADER = process.env.COINGECKO_API_HEADER || "x-cg-pro-api-key";

const DEFAULT_LIMIT = Math.max(1, Number.parseInt(process.env.DERIVATIVES_DASHBOARD_LIMIT || "6", 10));
const CACHE_TTL_MS = Math.max(0, Number.parseInt(process.env.DASHBOARD_CACHE_TTL_MS || "0", 10));
const START_DATE = new Date(Date.UTC(2023, 0, 1));

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

const toDateKey = (ts: number) => {
  const millis = ts > 1e12 ? ts : ts * 1000;
  const dt = new Date(millis);
  return dt.toISOString().slice(0, 10);
};

const toDateKeyMs = (ms: number) => {
  const dt = new Date(ms);
  return dt.toISOString().slice(0, 10);
};

const normalizePairSeries = (pairs: any[]) => {
  const out: Record<string, number> = {};
  for (const entry of pairs || []) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const ts = entry[0];
    const value = entry[1];
    if (typeof ts !== "number" || typeof value !== "number") continue;
    const dateKey = toDateKey(ts);
    if (new Date(dateKey) < START_DATE) continue;
    out[dateKey] = value;
  }
  return out;
};

const normalizeDailyVolume = (items: any[]) => {
  const out: Record<string, { volume?: number; openInterest?: number } > = {};
  for (const item of items || []) {
    if (!item || typeof item !== "object") continue;
    const ts = item.date;
    if (typeof ts !== "number") continue;
    const dateKey = toDateKey(ts);
    if (new Date(dateKey) < START_DATE) continue;
    if (!out[dateKey]) out[dateKey] = {};
    if (typeof item.volume === "number") out[dateKey].volume = item.volume;
    if (typeof item.openInterest === "number") out[dateKey].openInterest = item.openInterest;
  }
  return out;
};

const normalizeDerivatives = (payload: any) => {
  if (Array.isArray(payload?.dailyVolume)) {
    return normalizeDailyVolume(payload.dailyVolume);
  }
  if (Array.isArray(payload?.totalDataChart)) {
    const volumeSeries = normalizePairSeries(payload.totalDataChart);
    const out: Record<string, { volume?: number; openInterest?: number }> = {};
    Object.entries(volumeSeries).forEach(([date, value]) => {
      out[date] = { volume: value };
    });
    return out;
  }
  return {} as Record<string, { volume?: number; openInterest?: number }>;
};

const normalizeBreakdownSeries = (
  breakdown: any,
  slugByName: Map<string, string>
) => {
  const out: Record<string, Record<string, number>> = {};
  if (!Array.isArray(breakdown)) return out;
  for (const entry of breakdown) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const ts = entry[0];
    const values = entry[1];
    if (typeof ts !== "number" || !values || typeof values !== "object") continue;
    const dateKey = toDateKey(ts);
    if (new Date(dateKey) < START_DATE) continue;
    for (const [name, raw] of Object.entries(values)) {
      const slug = slugByName.get(name) || slugByName.get(String(name).toLowerCase());
      if (!slug) continue;
      const value = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(value)) continue;
      out[slug] = out[slug] || {};
      out[slug][dateKey] = value;
    }
  }
  return out;
};
const normalizeMarketCaps = (pairs: any[]) => {
  const out: Record<string, number> = {};
  for (const entry of pairs || []) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const ts = entry[0];
    const value = entry[1];
    if (typeof ts !== "number" || typeof value !== "number") continue;
    const dateKey = toDateKeyMs(ts);
    if (new Date(dateKey) < START_DATE) continue;
    out[dateKey] = value;
  }
  return out;
};

const safeDivide = (numer?: number, denom?: number) => {
  if (typeof numer !== "number" || typeof denom !== "number") return null;
  if (!Number.isFinite(numer) || !Number.isFinite(denom) || denom <= 0) return null;
  return numer / denom;
};

type ProtocolMeta = {
  slug: string;
  name: string;
  symbol?: string | null;
  gecko_id?: string | null;
  volume_30d?: number | null;
};

type SeriesPoint = {
  date: string;
  volume?: number | null;
  fees?: number | null;
  openInterest?: number | null;
  marketCap?: number | null;
  takeRate?: number | null;
};

type ProtocolSeries = ProtocolMeta & {
  points: SeriesPoint[];
};

const cache: Record<string, { expiresAt: number; payload: any }> = {};

const getCache = (key: string) => {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    delete cache[key];
    return null;
  }
  return entry.payload;
};

const setCache = (key: string, payload: any) => {
  if (CACHE_TTL_MS <= 0) return;
  cache[key] = { expiresAt: Date.now() + CACHE_TTL_MS, payload };
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slugsParam = searchParams.get("slugs");
  const limit = Math.max(1, Number.parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10));
  const fresh = searchParams.get("fresh") === "1";

  const cacheKey = `series:${slugsParam || ""}:${limit}`;
  if (!fresh) {
    const cached = getCache(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  try {
    const [overview, protocols] = await Promise.all([
      defillamaFetch("/api/overview/derivatives"),
      defillamaFetch("/api/protocols")
    ]);

    const protocolMeta = new Map<string, ProtocolMeta>();
    const protocolPayload = Array.isArray(protocols) ? protocols : protocols?.protocols || [];
    for (const item of protocolPayload) {
      if (!item || typeof item !== "object") continue;
      const slug = item.slug || item.id || item.name;
      if (!slug) continue;
      protocolMeta.set(String(slug), {
        slug: String(slug),
        name: String(item.name || item.displayName || slug),
        symbol: item.symbol || item.tokenSymbol || null,
        gecko_id: item.gecko_id || null
      });
    }

    const candidates: ProtocolMeta[] = [];
    const protocolsRaw = overview?.protocols;
    if (Array.isArray(protocolsRaw)) {
      for (const item of protocolsRaw) {
        if (!item || typeof item !== "object") continue;
        const slug = item.slug || item.id || item.name;
        if (!slug) continue;
        const meta = protocolMeta.get(String(slug)) || {
          slug: String(slug),
          name: String(item.name || item.displayName || slug)
        };
        candidates.push({
          ...meta,
          volume_30d: typeof item.total30d === "number" ? item.total30d : null
        });
      }
    } else if (protocolsRaw && typeof protocolsRaw === "object") {
      for (const [slug, info] of Object.entries(protocolsRaw)) {
        const meta = protocolMeta.get(String(slug)) || {
          slug: String(slug),
          name: String((info as any)?.name || slug)
        };
        candidates.push({
          ...meta,
          volume_30d: typeof (info as any)?.volume30d === "number" ? (info as any).volume30d : null
        });
      }
    }

    candidates.sort((a, b) => (b.volume_30d || 0) - (a.volume_30d || 0));

    let selected = candidates;
    if (slugsParam) {
      const requested = new Set(slugsParam.split(",").map((s) => s.trim()).filter(Boolean));
      selected = candidates.filter((item) => requested.has(item.slug));
    } else {
      selected = candidates.slice(0, limit);
    }

    const slugByName = new Map<string, string>();
    candidates.forEach((item) => {
      slugByName.set(item.name, item.slug);
      slugByName.set(item.name.toLowerCase(), item.slug);
    });
    const overviewVolumeBySlug = normalizeBreakdownSeries(
      overview?.totalDataChartBreakdown,
      slugByName
    );

    const seriesList = await mapLimit(selected, 4, async (protocol) => {
      const [derivativesResult, feesResult, marketCapResult] = await Promise.allSettled([
        defillamaFetch(`/api/summary/derivatives/${encodeURIComponent(protocol.slug)}`),
        defillamaFetch(`/api/summary/fees/${encodeURIComponent(protocol.slug)}`, {
          dataType: "dailyFees"
        }),
        protocol.gecko_id
          ? coingeckoFetch(`/coins/${encodeURIComponent(protocol.gecko_id)}/market_chart/range`, {
              vs_currency: "usd",
              from: String(Math.floor(START_DATE.getTime() / 1000)),
              to: String(Math.floor(Date.now() / 1000))
            })
          : Promise.resolve(null)
      ]);

      if (derivativesResult.status === "rejected") {
        console.warn(`Derivatives fetch failed for ${protocol.slug}:`, derivativesResult.reason);
      }
      if (feesResult.status === "rejected") {
        console.warn(`Fees fetch failed for ${protocol.slug}:`, feesResult.reason);
      }
      if (marketCapResult.status === "rejected") {
        console.warn(`Market cap fetch failed for ${protocol.slug}:`, marketCapResult.reason);
      }

      const derivatives =
        derivativesResult.status === "fulfilled" ? derivativesResult.value : null;
      const fees = feesResult.status === "fulfilled" ? feesResult.value : null;
      const marketCap = marketCapResult.status === "fulfilled" ? marketCapResult.value : null;

      let volumeSeries = normalizeDerivatives(derivatives);
      if (!Object.keys(volumeSeries).length && overviewVolumeBySlug[protocol.slug]) {
        const fallback = overviewVolumeBySlug[protocol.slug];
        volumeSeries = Object.entries(fallback).reduce((acc, [date, value]) => {
          acc[date] = { volume: value };
          return acc;
        }, {} as Record<string, { volume?: number; openInterest?: number }>);
      }
      const feesSeries = normalizePairSeries(fees?.totalDataChart || []);
      const marketCaps = normalizeMarketCaps(marketCap?.market_caps || []);

      const dateSet = new Set<string>();
      Object.keys(volumeSeries).forEach((date) => dateSet.add(date));
      Object.keys(feesSeries).forEach((date) => dateSet.add(date));
      Object.keys(marketCaps).forEach((date) => dateSet.add(date));

      const points: SeriesPoint[] = Array.from(dateSet)
        .sort()
        .map((date) => {
          const volume = volumeSeries[date]?.volume ?? null;
          const openInterest = volumeSeries[date]?.openInterest ?? null;
          const feesValue = feesSeries[date] ?? null;
          const marketCapValue = marketCaps[date] ?? null;
          return {
            date,
            volume,
            fees: feesValue,
            openInterest,
            marketCap: marketCapValue,
            takeRate: safeDivide(feesValue ?? undefined, volume ?? undefined)
          };
        });

      return {
        ...protocol,
        points
      } as ProtocolSeries;
    });

    const payload = {
      generatedAt: new Date().toISOString(),
      startDate: START_DATE.toISOString().slice(0, 10),
      protocols: seriesList
    };

    setCache(cacheKey, payload);

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
