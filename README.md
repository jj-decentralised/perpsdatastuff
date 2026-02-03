# Perps Dashboard

Real-time perpetual exchange dashboard built with Next.js. It pulls live data from DefiLlama Pro and CoinGecko Pro, then renders time-series and correlation scatter plots.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Required Env Vars

- `DEFILLAMA_API_KEY`
- `COINGECKO_API_KEY`
- `COINGECKO_API_HEADER` (`x-cg-pro-api-key`)

Optional:
- `DERIVATIVES_DASHBOARD_LIMIT` (default 6)
- `DASHBOARD_CACHE_TTL_MS` (default 60000)

## API

- `GET /api/perps/protocols` → list of derivatives protocols
- `GET /api/perps/series?slugs=...` → time series for selected protocols
