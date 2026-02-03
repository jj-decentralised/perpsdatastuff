import { getCoinGeckoConfig } from "./config";

export type CoinGeckoMarket = {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  fully_diluted_valuation: number | null;
};

const buildHeaders = () => {
  const { apiKey, header } = getCoinGeckoConfig();
  if (!apiKey) return {};
  return { [header]: apiKey } as Record<string, string>;
};

export const fetchMarketData = async (ids: string[]) => {
  const { apiKey, baseUrl } = getCoinGeckoConfig();
  if (!apiKey || ids.length === 0) {
    return [] as CoinGeckoMarket[];
  }

  const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
  const idsParam = uniqueIds.map((id) => encodeURIComponent(id)).join(",");
  const url = `${baseUrl}/coins/markets?vs_currency=usd&ids=${idsParam}`;

  const res = await fetch(url, {
    headers: buildHeaders(),
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`CoinGecko request failed: ${res.status}`);
  }

  return (await res.json()) as CoinGeckoMarket[];
};
