import { NextResponse } from "next/server";
import { fetchDerivativesOverview, fetchFeesOverview } from "@/lib/defillama";
import { fetchMarketData } from "@/lib/coingecko";
import {
  getCoinGeckoConfig,
  getProtocols,
  SUPPORTED_WINDOWS,
  windowToField,
  type WindowKey
} from "@/lib/config";

export const runtime = "nodejs";

type MetricsRow = {
  name: string;
  slug: string;
  symbol?: string | null;
  coingeckoId?: string | null;
  fees?: number | null;
  volume?: number | null;
  marketCap?: number | null;
  price?: number | null;
  fdv?: number | null;
  pf?: number | null;
  pv?: number | null;
  impliedByPF?: number | null;
  impliedByPV?: number | null;
  multipleByPF?: number | null;
  multipleByPV?: number | null;
};

const toNumberOrNull = (value: unknown) => (typeof value === "number" ? value : null);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const windowParam = (searchParams.get("window") || "30d") as WindowKey;
  const windowKey = (SUPPORTED_WINDOWS.includes(windowParam) ? windowParam : "30d") as WindowKey;
  const field = windowToField(windowKey);

  const warnings: string[] = [];

  try {
    const [{ drift, peers }, feesOverview, derivativesOverview] = await Promise.all([
      Promise.resolve(getProtocols()),
      fetchFeesOverview(),
      fetchDerivativesOverview()
    ]);

    const feesMap = new Map(feesOverview.protocols.map((protocol) => [protocol.slug, protocol]));
    const derivativesMap = new Map(
      derivativesOverview.protocols.map((protocol) => [protocol.slug, protocol])
    );

    const allProtocols = [drift, ...peers];
    const coinIds = allProtocols
      .map((protocol) => protocol.coingeckoId)
      .filter((id): id is string => Boolean(id));

    let marketData = [] as Awaited<ReturnType<typeof fetchMarketData>>;
    const { apiKey } = getCoinGeckoConfig();
    if (!apiKey) {
      warnings.push(
        "Missing CoinGecko API key. Market cap data will be unavailable until it is set."
      );
    }

    try {
      marketData = await fetchMarketData(coinIds);
    } catch (error) {
      warnings.push(
        error instanceof Error ? error.message : "CoinGecko request failed unexpectedly."
      );
    }

    if (apiKey && coinIds.length > 0 && marketData.length === 0) {
      warnings.push(
        "CoinGecko data unavailable. Check COINGECKO_API_KEY and COINGECKO_API_KEY_HEADER."
      );
    }

    const marketMap = new Map(marketData.map((item) => [item.id, item]));

    const buildRow = (protocol: (typeof allProtocols)[number]): MetricsRow => {
      const feesSource = feesMap.get(protocol.slug);
      const derivativesSource = derivativesMap.get(protocol.slug);
      const market = protocol.coingeckoId ? marketMap.get(protocol.coingeckoId) : undefined;

      const fees = toNumberOrNull(feesSource?.[field]);
      const volume = toNumberOrNull(derivativesSource?.[field]);
      const marketCap = toNumberOrNull(market?.market_cap);
      const price = toNumberOrNull(market?.current_price);
      const fdv = toNumberOrNull(market?.fully_diluted_valuation);

      const pf = marketCap && fees ? marketCap / fees : null;
      const pv = marketCap && volume ? marketCap / volume : null;

      return {
        name: protocol.name,
        slug: protocol.slug,
        symbol: protocol.symbol,
        coingeckoId: protocol.coingeckoId,
        fees,
        volume,
        marketCap,
        price,
        fdv,
        pf,
        pv
      };
    };

    const driftRow = buildRow(drift);
    const peerRows = peers.map(buildRow);

    const enrichedPeers = peerRows.map((peer) => {
      const impliedByPF = driftRow.fees && peer.pf ? driftRow.fees * peer.pf : null;
      const impliedByPV = driftRow.volume && peer.pv ? driftRow.volume * peer.pv : null;
      const multipleByPF =
        driftRow.marketCap && impliedByPF ? impliedByPF / driftRow.marketCap : null;
      const multipleByPV =
        driftRow.marketCap && impliedByPV ? impliedByPV / driftRow.marketCap : null;

      return {
        ...peer,
        impliedByPF,
        impliedByPV,
        multipleByPF,
        multipleByPV
      };
    });

    if (!driftRow.fees || !driftRow.volume) {
      warnings.push(
        "Drift volume or fees missing from DefiLlama. Implied market caps may be incomplete."
      );
    }

    return NextResponse.json({
      window: windowKey,
      generatedAt: new Date().toISOString(),
      drift: driftRow,
      peers: enrichedPeers,
      warnings
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
