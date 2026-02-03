import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFILLAMA_BASE = process.env.DEFILLAMA_BASE_URL || "https://pro-api.llama.fi";
const DEFILLAMA_KEY = process.env.DEFILLAMA_API_KEY || "";
const DEFILLAMA_KEY_IN_PATH = (process.env.DEFILLAMA_KEY_IN_PATH || "true").toLowerCase() !== "false";

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

type ProtocolRow = {
  slug: string;
  name: string;
  volume_24h?: number | null;
  volume_7d?: number | null;
  volume_30d?: number | null;
  volume_all_time?: number | null;
  symbol?: string | null;
  gecko_id?: string | null;
};

export async function GET() {
  try {
    const [overview, protocols] = await Promise.all([
      defillamaFetch("/api/overview/derivatives"),
      defillamaFetch("/api/protocols")
    ]);

    const protocolList: ProtocolRow[] = [];

    const protocolMeta = new Map<string, { symbol?: string | null; gecko_id?: string | null; name?: string | null }>();
    const protocolPayload = Array.isArray(protocols) ? protocols : protocols?.protocols || [];
    for (const item of protocolPayload) {
      if (!item || typeof item !== "object") continue;
      const slug = item.slug || item.id || item.name;
      if (!slug) continue;
      protocolMeta.set(String(slug), {
        symbol: item.symbol || item.tokenSymbol || null,
        gecko_id: item.gecko_id || item.geckoId || item.geckoID || null,
        name: item.name || item.displayName || null
      });
    }

    const protocolsRaw = overview?.protocols;
    if (Array.isArray(protocolsRaw)) {
      for (const item of protocolsRaw) {
        if (!item || typeof item !== "object") continue;
        const slug = item.slug || item.id || item.name;
        if (!slug) continue;
        const name = item.name || item.displayName || slug;
        const meta = protocolMeta.get(String(slug));
        protocolList.push({
          slug: String(slug),
          name: String(name),
          volume_24h: typeof item.total24h === "number" ? item.total24h : null,
          volume_7d: typeof item.total7d === "number" ? item.total7d : null,
          volume_30d: typeof item.total30d === "number" ? item.total30d : null,
          volume_all_time: typeof item.totalAllTime === "number" ? item.totalAllTime : null,
          symbol: meta?.symbol || null,
          gecko_id: meta?.gecko_id || null
        });
      }
    } else if (protocolsRaw && typeof protocolsRaw === "object") {
      for (const [slug, info] of Object.entries(protocolsRaw)) {
        const name = (info as any)?.name || slug;
        const meta = protocolMeta.get(String(slug));
        protocolList.push({
          slug: String(slug),
          name: String(name),
          volume_24h: typeof (info as any)?.volume24h === "number" ? (info as any).volume24h : null,
          volume_7d: typeof (info as any)?.volume7d === "number" ? (info as any).volume7d : null,
          volume_30d: typeof (info as any)?.volume30d === "number" ? (info as any).volume30d : null,
          volume_all_time: typeof (info as any)?.totalVolume === "number" ? (info as any).totalVolume : null,
          symbol: meta?.symbol || null,
          gecko_id: meta?.gecko_id || null
        });
      }
    }

    protocolList.sort((a, b) => (b.volume_30d || 0) - (a.volume_30d || 0));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      protocols: protocolList
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
