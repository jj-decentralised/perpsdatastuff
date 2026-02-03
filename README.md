# Drift Perps WSJ Comparator

A small Next.js dashboard that compares Drift Protocol implied market caps using peer perpetual exchange P/F and P/V ratios. It pulls:

- DefiLlama fees + derivatives volume
- CoinGecko market caps

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file based on `.env.example` and add your CoinGecko API key:

```bash
cp .env.example .env.local
```

3. Run locally:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Config

- `COINGECKO_API_KEY` is required for market cap data.
- `COINGECKO_API_KEY_HEADER` defaults to `x-cg-demo-api-key` (set to `x-cg-pro-api-key` for Pro keys).
- `COINGECKO_BASE_URL` can be set to `https://pro-api.coingecko.com/api/v3` for Pro.
- `PROTOCOL_OVERRIDES` lets you replace the default protocol list with your own JSON array.

Example override:

```json
[
  { "name": "Drift Trade", "slug": "drift-trade", "coingeckoId": "drift-protocol", "symbol": "DRIFT" },
  { "name": "dYdX V4", "slug": "dydx-v4", "coingeckoId": "dydx", "symbol": "DYDX" }
]
```
