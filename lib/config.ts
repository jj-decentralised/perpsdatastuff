export type ProtocolConfig = {
  name: string;
  slug: string;
  coingeckoId?: string | null;
  symbol?: string | null;
};

export const DRIFT_PROTOCOL: ProtocolConfig = {
  name: "Drift Trade",
  slug: "drift-trade",
  coingeckoId: "drift-protocol",
  symbol: "DRIFT"
};

export const DEFAULT_PEERS: ProtocolConfig[] = [
  {
    name: "dYdX V4",
    slug: "dydx-v4",
    coingeckoId: "dydx",
    symbol: "DYDX"
  },
  {
    name: "GMX V1 Perps",
    slug: "gmx-v1-perps",
    coingeckoId: "gmx",
    symbol: "GMX"
  },
  {
    name: "Gains Network",
    slug: "gains-network",
    coingeckoId: "gains-network",
    symbol: "GNS"
  },
  {
    name: "Aevo Perps",
    slug: "aevo-perps",
    coingeckoId: "aevo",
    symbol: "AEVO"
  },
  {
    name: "Vertex Perps",
    slug: "vertex-perps",
    coingeckoId: "vertex-protocol",
    symbol: "VRTX"
  }
];

const parseOverrides = (): ProtocolConfig[] | null => {
  const raw = process.env.PROTOCOL_OVERRIDES;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((item) => ({
        name: String(item.name || ""),
        slug: String(item.slug || ""),
        coingeckoId: item.coingeckoId ? String(item.coingeckoId) : null,
        symbol: item.symbol ? String(item.symbol) : null
      }))
      .filter((item) => item.name && item.slug);
  } catch {
    return null;
  }
};

export const getProtocols = () => {
  const overrides = parseOverrides();
  if (!overrides || overrides.length === 0) {
    return {
      drift: DRIFT_PROTOCOL,
      peers: DEFAULT_PEERS
    };
  }

  const drift = overrides.find((item) => item.slug === DRIFT_PROTOCOL.slug) || DRIFT_PROTOCOL;
  const peers = overrides.filter((item) => item.slug !== drift.slug);

  return {
    drift,
    peers
  };
};

export const getCoinGeckoConfig = () => {
  const EMBEDDED_COINGECKO_API_KEY = "CG-VZVqaaSix88yozFfQBNKszir";
  const apiKey = process.env.COINGECKO_API_KEY || EMBEDDED_COINGECKO_API_KEY || "";
  const header = process.env.COINGECKO_API_KEY_HEADER || "x-cg-demo-api-key";
  const baseUrl = process.env.COINGECKO_BASE_URL || "https://api.coingecko.com/api/v3";

  return {
    apiKey,
    header,
    baseUrl
  };
};

export const SUPPORTED_WINDOWS = ["24h", "7d", "30d"] as const;
export type WindowKey = (typeof SUPPORTED_WINDOWS)[number];

export const windowToField = (window: WindowKey) => {
  switch (window) {
    case "24h":
      return "total24h";
    case "7d":
      return "total7d";
    case "30d":
    default:
      return "total30d";
  }
};
