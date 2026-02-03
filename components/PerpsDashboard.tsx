"use client";

import { useEffect, useMemo, useState } from "react";
import LineChart from "@/components/charts/LineChart";
import ScatterPlot from "@/components/charts/ScatterPlot";

const number = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2
});

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 1,
  notation: "compact"
});

type ProtocolRow = {
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

type ProtocolSeries = ProtocolRow & {
  points: SeriesPoint[];
};

type ProtocolListResponse = {
  generatedAt: string;
  protocols: ProtocolRow[];
  error?: string;
};

type SeriesResponse = {
  generatedAt: string;
  startDate: string;
  protocols: ProtocolSeries[];
  error?: string;
};

const pairs = [
  { key: "mcap_volume", x: "marketCap", y: "volume", label: "MCAP vs Volume" },
  { key: "mcap_fees", x: "marketCap", y: "fees", label: "MCAP vs Fees" },
  { key: "fees_volume", x: "fees", y: "volume", label: "Fees vs Volume" },
  { key: "take_volume", x: "takeRate", y: "volume", label: "Take Rate vs Volume" },
  { key: "take_mcap", x: "takeRate", y: "marketCap", label: "Take Rate vs MCAP" },
  { key: "oi_volume", x: "openInterest", y: "volume", label: "OI vs Volume" },
  { key: "oi_take", x: "openInterest", y: "takeRate", label: "OI vs Take Rate" },
  { key: "oi_mcap", x: "openInterest", y: "marketCap", label: "OI vs MCAP" }
] as const;

const toUSD = (value?: number | null) => (typeof value === "number" ? usd.format(value) : "—");
const toUSDCompact = (value?: number | null) =>
  typeof value === "number" ? usdCompact.format(value) : "—";
const toPct = (value?: number | null) =>
  typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "—";

const pearson = (xs: number[], ys: number[]) => {
  if (xs.length < 2 || ys.length < 2 || xs.length !== ys.length) return null;
  const n = xs.length;
  const meanX = xs.reduce((sum, v) => sum + v, 0) / n;
  const meanY = ys.reduce((sum, v) => sum + v, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (!denX || !denY) return null;
  return num / Math.sqrt(denX * denY);
};

export default function PerpsDashboard() {
  const [protocols, setProtocols] = useState<ProtocolRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [series, setSeries] = useState<ProtocolSeries | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/perps/protocols", { cache: "no-store" })
      .then((res) => res.json())
      .then((payload: ProtocolListResponse) => {
        if (!mounted) return;
        if (payload.error) {
          setError(payload.error);
          return;
        }
        setProtocols(payload.protocols);
        if (!selected && payload.protocols.length) {
          setSelected(payload.protocols[0].slug);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.message || "Failed to load protocols.");
      });
    return () => {
      mounted = false;
    };
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    let mounted = true;
    setLoading(true);
    setError(null);
    fetch(`/api/perps/series?slugs=${selected}&fresh=1`, { cache: "no-store" })
      .then((res) => res.json())
      .then((payload: SeriesResponse) => {
        if (!mounted) return;
        if (payload.error) {
          setError(payload.error);
          setSeries(null);
          return;
        }
        setSeries(payload.protocols[0] || null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.message || "Failed to load series.");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [selected]);

  const latestPoint = useMemo(() => {
    if (!series?.points?.length) return null;
    return series.points[series.points.length - 1];
  }, [series]);

  const lineSeries = useMemo(() => {
    if (!series) return null;
    return {
      volume: series.points.map((point) => ({ date: point.date, value: point.volume ?? null })),
      fees: series.points.map((point) => ({ date: point.date, value: point.fees ?? null })),
      marketCap: series.points.map((point) => ({ date: point.date, value: point.marketCap ?? null })),
      openInterest: series.points.map((point) => ({ date: point.date, value: point.openInterest ?? null })),
      takeRate: series.points.map((point) => ({ date: point.date, value: point.takeRate ?? null }))
    };
  }, [series]);

  const scatterData = useMemo(() => {
    if (!series) return [];
    return pairs.map((pair) => {
      const xs: number[] = [];
      const ys: number[] = [];
      const points = series.points
        .map((point) => {
          const xVal = (point as any)[pair.x];
          const yVal = (point as any)[pair.y];
          if (typeof xVal !== "number" || typeof yVal !== "number") return null;
          xs.push(xVal);
          ys.push(yVal);
          return { x: xVal, y: yVal };
        })
        .filter((point): point is { x: number; y: number } => Boolean(point));

      return {
        ...pair,
        points,
        correlation: pearson(xs, ys)
      };
    });
  }, [series]);

  return (
    <section className="perps">
      <div className="perps__header">
        <div>
          <div className="perps__kicker">Perpetual Exchange Dashboard</div>
          <h1>Perps Pulse</h1>
          <p>
            Historic volume, fees, open interest, and market cap correlation for top perpetual
            exchanges. Data updates live from DefiLlama Pro and CoinGecko Pro.
          </p>
        </div>
        <div className="perps__controls">
          <label className="control">
            <span>Protocol</span>
            <select value={selected} onChange={(event) => setSelected(event.target.value)}>
              {protocols.map((protocol) => (
                <option key={protocol.slug} value={protocol.slug}>
                  {protocol.name}
                </option>
              ))}
            </select>
          </label>
          <div className="control control--meta">
            <span>Window</span>
            <strong>Jan 2023 → Today</strong>
          </div>
        </div>
      </div>

      {error ? <div className="notice notice--error">{error}</div> : null}
      {loading ? <div className="notice">Loading live series…</div> : null}

      {series && latestPoint ? (
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-card__label">Market Cap</div>
            <div className="summary-card__value">{toUSDCompact(latestPoint.marketCap)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-card__label">Daily Volume</div>
            <div className="summary-card__value">{toUSDCompact(latestPoint.volume)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-card__label">Daily Fees</div>
            <div className="summary-card__value">{toUSDCompact(latestPoint.fees)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-card__label">Open Interest</div>
            <div className="summary-card__value">{toUSDCompact(latestPoint.openInterest)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-card__label">Take Rate</div>
            <div className="summary-card__value">{toPct(latestPoint.takeRate)}</div>
          </div>
        </div>
      ) : null}

      {series && lineSeries ? (
        <div className="charts-grid">
          <LineChart
            title="Daily Volume"
            subtitle="Perps traded volume"
            series={[{ label: "Volume", color: "#111", values: lineSeries.volume }]}
          />
          <LineChart
            title="Daily Fees"
            subtitle="Fees generated"
            series={[{ label: "Fees", color: "#303030", values: lineSeries.fees }]}
          />
          <LineChart
            title="Market Cap"
            subtitle="CoinGecko market cap"
            series={[{ label: "MCAP", color: "#5b5b5b", values: lineSeries.marketCap }]}
          />
          <LineChart
            title="Open Interest"
            subtitle="Perps open interest"
            series={[{ label: "OI", color: "#7a7a7a", values: lineSeries.openInterest }]}
          />
          <LineChart
            title="Take Rate"
            subtitle="Fees ÷ volume"
            series={[{ label: "Take Rate", color: "#000", values: lineSeries.takeRate }]}
          />
        </div>
      ) : null}

      {series ? (
        <div className="scatter-grid">
          {scatterData.map((pair) => (
            <ScatterPlot
              key={pair.key}
              title={pair.label}
              subtitle={series.name}
              points={pair.points}
              xLabel={pair.x}
              yLabel={pair.y}
              correlation={pair.correlation}
            />
          ))}
        </div>
      ) : null}

      {series ? (
        <div className="footnote">
          Latest snapshot: {latestPoint?.date || "—"}. Fees and volume are daily totals from
          DefiLlama. Market cap is daily CoinGecko. Take rate is fees divided by volume.
        </div>
      ) : null}
    </section>
  );
}
