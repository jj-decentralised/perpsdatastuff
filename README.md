# Perps Dashboard

Professional, real-time perpetual exchange dashboard built with Next.js. Pulls live DefiLlama Pro + CoinGecko Pro data and renders tables, time-series, and correlation scatter plots for all tracked exchanges in a single view.

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
- `DASHBOARD_CACHE_TTL_MS` (default 0 for real‑time)

## API

- `GET /api/perps/protocols` → list of derivatives protocols
- `GET /api/perps/series?limit=12` → live series for top exchanges
