export type LlamaProtocol = {
  name: string;
  slug: string;
  total24h?: number;
  total7d?: number;
  total30d?: number;
  category?: string | null;
  chains?: string[];
  logo?: string | null;
};

export type LlamaOverview = {
  protocols: LlamaProtocol[];
};

const FEES_URL = "https://api.llama.fi/overview/fees";
const DERIVATIVES_URL = "https://api.llama.fi/overview/derivatives";

const fetchJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`DefiLlama request failed: ${res.status}`);
  }
  return (await res.json()) as T;
};

export const fetchFeesOverview = async () => fetchJson<LlamaOverview>(FEES_URL);

export const fetchDerivativesOverview = async () => fetchJson<LlamaOverview>(DERIVATIVES_URL);
