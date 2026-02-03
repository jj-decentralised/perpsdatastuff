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

const pct = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2
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
const toPct = (value?: number | null) => (typeof value === "number" ? pct.format(value) : "—");

const safeDivide = (numer?: number | null, denom?: number | null) => {
  if (typeof numer !== "number" || typeof denom !== "number") return null;
  if (!Number.isFinite(numer) || !Number.isFinite(denom) || denom <= 0) return null;
  return numer / denom;
};

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

type SnapshotRow = {
  slug: string;
  name: string;
  symbol?: string | null;
  date: string;
  volume?: number | null;
  fees?: number | null;
  openInterest?: number | null;
  marketCap?: number | null;
  takeRate?: number | null;
  pf?: number | null;
};

type WindowRow = SnapshotRow & {
  windowDays: number;
  volumeSum?: number | null;
  feesSum?: number | null;
  openInterestAvg?: number | null;
  marketCapAvg?: number | null;
};

const buildLatestSnapshot = (protocol: ProtocolSeries): SnapshotRow | null => {
  if (!protocol.points.length) return null;
  const latest = [...protocol.points]
    .reverse()
    .find((point) =>
      [point.volume, point.fees, point.openInterest, point.marketCap].some(
        (value) => typeof value === "number"
      )
    );
  if (!latest) return null;
  const takeRate =
    typeof latest.takeRate === "number" ? latest.takeRate : safeDivide(latest.fees, latest.volume);
  const pf = safeDivide(latest.marketCap, latest.fees);
  return {
    slug: protocol.slug,
    name: protocol.name,
    symbol: protocol.symbol,
    date: latest.date,
    volume: latest.volume ?? null,
    fees: latest.fees ?? null,
    openInterest: latest.openInterest ?? null,
    marketCap: latest.marketCap ?? null,
    takeRate,
    pf
  };
};

const buildWindowSnapshot = (protocol: ProtocolSeries, windowDays: number): WindowRow | null => {
  if (!protocol.points.length) return null;
  const latest = [...protocol.points]
    .reverse()
    .find((point) =>
      [point.volume, point.fees, point.openInterest, point.marketCap].some(
        (value) => typeof value === "number"
      )
    );
  if (!latest) return null;
  const endDate = new Date(latest.date);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - (windowDays - 1));

  const windowPoints = protocol.points.filter((point) => {
    const dt = new Date(point.date);
    return dt >= startDate && dt <= endDate;
  });

  const sum = (key: keyof SeriesPoint) => {
    const values = windowPoints
      .map((point) => point[key])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (!values.length) return null;
    return values.reduce((acc, val) => acc + val, 0);
  };

  const mean = (key: keyof SeriesPoint) => {
    const values = windowPoints
      .map((point) => point[key])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (!values.length) return null;
    return values.reduce((acc, val) => acc + val, 0) / values.length;
  };

  const volumeSum = sum("volume");
  const feesSum = sum("fees");
  const openInterestAvg = mean("openInterest");
  const marketCapAvg = mean("marketCap");
  const takeRate = safeDivide(feesSum, volumeSum);
  const pf = safeDivide(marketCapAvg, feesSum);

  return {
    slug: protocol.slug,
    name: protocol.name,
    symbol: protocol.symbol,
    date: latest.date,
    volume: latest.volume ?? null,
    fees: latest.fees ?? null,
    openInterest: latest.openInterest ?? null,
    marketCap: latest.marketCap ?? null,
    takeRate,
    pf,
    windowDays,
    volumeSum,
    feesSum,
    openInterestAvg,
    marketCapAvg
  };
};

const buildTotals = (protocols: ProtocolSeries[]) => {
  const map = new Map<string, { volume: number; fees: number; oi: number; mcap: number }>();
  protocols.forEach((protocol) => {
    protocol.points.forEach((point) => {
      const entry = map.get(point.date) || { volume: 0, fees: 0, oi: 0, mcap: 0 };
      if (typeof point.volume === "number") entry.volume += point.volume;
      if (typeof point.fees === "number") entry.fees += point.fees;
      if (typeof point.openInterest === "number") entry.oi += point.openInterest;
      if (typeof point.marketCap === "number") entry.mcap += point.marketCap;
      map.set(point.date, entry);
    });
  });

  const dates = Array.from(map.keys()).sort();
  return {
    dates,
    volume: dates.map((date) => ({ date, value: map.get(date)?.volume ?? null })),
    fees: dates.map((date) => ({ date, value: map.get(date)?.fees ?? null })),
    openInterest: dates.map((date) => ({ date, value: map.get(date)?.oi ?? null })),
    marketCap: dates.map((date) => ({ date, value: map.get(date)?.mcap ?? null }))
  };
};

export default function PerpsDashboard() {
  const [payload, setPayload] = useState<SeriesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch("/api/perps/series?limit=12&fresh=1", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: SeriesResponse) => {
        if (!mounted) return;
        if (data.error) {
          setError(data.error);
          setPayload(null);
          return;
        }
        setPayload(data);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.message || "Failed to load live data.");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const snapshots = useMemo(() => {
    if (!payload?.protocols) return [];
    return payload.protocols
      .map(buildLatestSnapshot)
      .filter((row): row is SnapshotRow => Boolean(row))
      .sort((a, b) => (b.volume || 0) - (a.volume || 0));
  }, [payload]);

  const windowSnapshots = useMemo(() => {
    if (!payload?.protocols) return [];
    return payload.protocols
      .map((protocol) => buildWindowSnapshot(protocol, 30))
      .filter((row): row is WindowRow => Boolean(row))
      .sort((a, b) => (b.volumeSum || 0) - (a.volumeSum || 0));
  }, [payload]);

  const totals = useMemo(() => {
    if (!payload?.protocols) return null;
    return buildTotals(payload.protocols);
  }, [payload]);

  const scatterData = useMemo(() => {
    if (!payload?.protocols) return [];
    return pairs.map((pair) => {
      const xs: number[] = [];
      const ys: number[] = [];
      const points = payload.protocols
        .flatMap((protocol) =>
          protocol.points.map((point) => {
            const xVal = (point as any)[pair.x];
            const yVal = (point as any)[pair.y];
            if (typeof xVal !== "number" || typeof yVal !== "number") return null;
            xs.push(xVal);
            ys.push(yVal);
            return { x: xVal, y: yVal };
          })
        )
        .filter((point): point is { x: number; y: number } => Boolean(point));

      return {
        ...pair,
        points,
        correlation: pearson(xs, ys)
      };
    });
  }, [payload]);

  const latestDate = snapshots[0]?.date || payload?.generatedAt?.slice(0, 10) || "—";

  const leaders = useMemo(() => {
    if (!snapshots.length) return [];
    const byMetric = (key: keyof SnapshotRow) => {
      const row = snapshots
        .filter((item) => typeof item[key] === "number")
        .sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0))[0];
      return row ? (row[key] as number) : null;
    };

    return [
      {
        label: "Volume",
        row: snapshots
          .filter((row) => typeof row.volume === "number")
          .sort((a, b) => (b.volume || 0) - (a.volume || 0))[0],
        value: byMetric("volume"),
        display: (value: number | null) => (typeof value === "number" ? toUSDCompact(value) : "—")
      },
      {
        label: "Fees",
        row: snapshots
          .filter((row) => typeof row.fees === "number")
          .sort((a, b) => (b.fees || 0) - (a.fees || 0))[0],
        value: byMetric("fees"),
        display: (value: number | null) => (typeof value === "number" ? toUSDCompact(value) : "—")
      },
      {
        label: "Open Interest",
        row: snapshots
          .filter((row) => typeof row.openInterest === "number")
          .sort((a, b) => (b.openInterest || 0) - (a.openInterest || 0))[0],
        value: byMetric("openInterest"),
        display: (value: number | null) => (typeof value === "number" ? toUSDCompact(value) : "—")
      },
      {
        label: "Take Rate",
        row: snapshots
          .filter((row) => typeof row.takeRate === "number")
          .sort((a, b) => (b.takeRate || 0) - (a.takeRate || 0))[0],
        value: byMetric("takeRate"),
        display: (value: number | null) => (typeof value === "number" ? toPct(value) : "—")
      },
      {
        label: "P/F Ratio",
        row: snapshots
          .filter((row) => typeof row.pf === "number")
          .sort((a, b) => (b.pf || 0) - (a.pf || 0))[0],
        value: byMetric("pf"),
        display: (value: number | null) =>
          typeof value === "number" ? `${number.format(value)}x` : "—"
      }
    ];
  }, [snapshots]);

  return (
    <section className="dashboard-shell">
      <header className="hero">
        <div>
          <span className="hero__kicker">Perpetual Exchange Intelligence</span>
          <h1>Perps Market Dashboard</h1>
          <p>
            Live, daily‑granularity tracking of perps volume, fees, open interest, and market‑cap
            correlations since January 2023. Data updates continuously from DefiLlama Pro and
            CoinGecko Pro.
          </p>
        </div>
        <div className="hero__meta">
          <div>
            <span>Coverage</span>
            <strong>Top 12 exchanges by 30‑day volume</strong>
          </div>
          <div>
            <span>Range</span>
            <strong>Jan 2023 → Present</strong>
          </div>
          <div>
            <span>Latest</span>
            <strong>{latestDate}</strong>
          </div>
        </div>
      </header>

      {error ? <div className="notice notice--error">{error}</div> : null}
      {loading ? <div className="notice">Loading live data…</div> : null}

      {snapshots.length ? (
        <div className="table-section">
          <div className="section-header">
            <h2>Latest Daily Snapshot</h2>
            <span>Market cap from CoinGecko. P/F uses latest daily fees.</span>
          </div>
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Exchange</th>
                  <th>Volume</th>
                  <th>Fees</th>
                  <th>Open Interest</th>
                  <th>Market Cap</th>
                  <th>Take Rate</th>
                  <th>P/F Ratio</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((row) => (
                  <tr key={row.slug}>
                    <td>
                      <div className="cell-title">{row.name}</div>
                      <div className="cell-sub">{row.symbol || row.slug}</div>
                    </td>
                    <td>{toUSDCompact(row.volume)}</td>
                    <td>{toUSDCompact(row.fees)}</td>
                    <td>{toUSDCompact(row.openInterest)}</td>
                    <td>{toUSDCompact(row.marketCap)}</td>
                    <td>{toPct(row.takeRate)}</td>
                    <td>{typeof row.pf === "number" ? `${number.format(row.pf)}x` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {windowSnapshots.length ? (
        <div className="table-section">
          <div className="section-header">
            <h2>30‑Day Rolling Totals</h2>
            <span>Rolling sums/averages based on latest 30 days.</span>
          </div>
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Exchange</th>
                  <th>30d Volume</th>
                  <th>30d Fees</th>
                  <th>Avg OI</th>
                  <th>Avg Market Cap</th>
                  <th>Take Rate</th>
                  <th>P/F (avg)</th>
                </tr>
              </thead>
              <tbody>
                {windowSnapshots.map((row) => (
                  <tr key={row.slug}>
                    <td>
                      <div className="cell-title">{row.name}</div>
                      <div className="cell-sub">{row.symbol || row.slug}</div>
                    </td>
                    <td>{toUSDCompact(row.volumeSum)}</td>
                    <td>{toUSDCompact(row.feesSum)}</td>
                    <td>{toUSDCompact(row.openInterestAvg)}</td>
                    <td>{toUSDCompact(row.marketCapAvg)}</td>
                    <td>{toPct(row.takeRate)}</td>
                    <td>{typeof row.pf === "number" ? `${number.format(row.pf)}x` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {leaders.length ? (
        <div className="table-section">
          <div className="section-header">
            <h2>Metric Leaders</h2>
            <span>Top exchange by metric in the latest snapshot.</span>
          </div>
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Leader</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((leader) => (
                  <tr key={leader.label}>
                    <td>{leader.label}</td>
                    <td>{leader.row ? leader.row.name : "—"}</td>
                    <td>{leader.display(leader.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {totals ? (
        <div className="charts-grid">
          <LineChart
            title="Total Daily Volume"
            subtitle="Sum of tracked exchanges"
            series={[{ label: "Volume", color: "#111", values: totals.volume }]}
          />
          <LineChart
            title="Total Daily Fees"
            subtitle="Sum of tracked exchanges"
            series={[{ label: "Fees", color: "#333", values: totals.fees }]}
          />
          <LineChart
            title="Total Open Interest"
            subtitle="Sum of tracked exchanges"
            series={[{ label: "Open Interest", color: "#555", values: totals.openInterest }]}
          />
          <LineChart
            title="Total Market Cap"
            subtitle="CoinGecko market cap"
            series={[{ label: "Market Cap", color: "#777", values: totals.marketCap }]}
          />
        </div>
      ) : null}

      {scatterData.length ? (
        <div className="scatter-grid">
          {scatterData.map((pair) => (
            <ScatterPlot
              key={pair.key}
              title={pair.label}
              subtitle="All tracked exchanges"
              points={pair.points}
              xLabel={pair.x}
              yLabel={pair.y}
              correlation={pair.correlation}
            />
          ))}
        </div>
      ) : null}

      <div className="footnote">
        Lowest‑granularity data: daily series from DefiLlama Pro and CoinGecko Pro. Take rate = fees
        ÷ volume. P/F ratio = market cap ÷ daily fees.
      </div>
    </section>
  );
}
