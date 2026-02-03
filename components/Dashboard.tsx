"use client";

import { useEffect, useMemo, useState } from "react";

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

type MetricsResponse = {
  window: "24h" | "7d" | "30d";
  generatedAt: string;
  drift: MetricsRow;
  peers: MetricsRow[];
  warnings?: string[];
  error?: string;
};

const windows = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" }
] as const;

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

const formatUsd = (value?: number | null) =>
  typeof value === "number" ? usd.format(value) : "—";

const formatUsdCompact = (value?: number | null) =>
  typeof value === "number" ? usdCompact.format(value) : "—";

const formatRatio = (value?: number | null) =>
  typeof value === "number" ? `${number.format(value)}x` : "—";

const formatPrice = (value?: number | null) =>
  typeof value === "number" ? `$${number.format(value)}` : "—";

export default function Dashboard() {
  const [window, setWindow] = useState<(typeof windows)[number]["value"]>("30d");
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    setLoading(true);
    setError(null);

    fetch(`/api/metrics?window=${window}`)
      .then((res) => res.json())
      .then((payload: MetricsResponse) => {
        if (!isActive) return;
        if (payload.error) {
          setError(payload.error);
          setData(null);
          return;
        }
        setData(payload);
      })
      .catch((err) => {
        if (!isActive) return;
        setError(err?.message || "Failed to load metrics.");
      })
      .finally(() => {
        if (!isActive) return;
        setLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [window]);

  const maxImplied = useMemo(() => {
    if (!data) return 0;
    const values = data.peers.flatMap((peer) => [peer.impliedByPF || 0, peer.impliedByPV || 0]);
    return Math.max(data.drift.marketCap || 0, ...values, 0);
  }, [data]);

  return (
    <section className="dashboard">
      <div className="toolbar">
        <div className="toolbar__group">
          <span className="label">Time window</span>
          <div className="segmented">
            {windows.map((item) => (
              <button
                key={item.value}
                type="button"
                className={window === item.value ? "segmented__btn is-active" : "segmented__btn"}
                onClick={() => setWindow(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar__meta">
          {loading ? "Refreshing" : data ? `Updated ${new Date(data.generatedAt).toLocaleString()}` : ""}
        </div>
      </div>

      {error ? (
        <div className="notice notice--error">{error}</div>
      ) : null}

      {data?.warnings?.length ? (
        <div className="notice notice--warn">
          {data.warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}

      {data ? (
        <div className="grid">
          <div className="card">
            <div className="card__eyebrow">Drift snapshot</div>
            <div className="card__title">{data.drift.name}</div>
            <div className="card__sub">{data.drift.symbol ? `${data.drift.symbol} • ` : ""}Drift Protocol</div>
            <div className="card__metrics">
              <div>
                <div className="metric__label">Market cap</div>
                <div className="metric__value">{formatUsdCompact(data.drift.marketCap)}</div>
              </div>
              <div>
                <div className="metric__label">Price</div>
                <div className="metric__value">{formatPrice(data.drift.price)}</div>
              </div>
              <div>
                <div className="metric__label">Fees ({data.window})</div>
                <div className="metric__value">{formatUsdCompact(data.drift.fees)}</div>
              </div>
              <div>
                <div className="metric__label">Perps volume ({data.window})</div>
                <div className="metric__value">{formatUsdCompact(data.drift.volume)}</div>
              </div>
              <div>
                <div className="metric__label">P/F</div>
                <div className="metric__value">{formatRatio(data.drift.pf)}</div>
              </div>
              <div>
                <div className="metric__label">P/V</div>
                <div className="metric__value">{formatRatio(data.drift.pv)}</div>
              </div>
            </div>
          </div>

          <div className="card card--wide">
            <div className="card__eyebrow">Peer scenarios</div>
            <div className="card__title">Implied Drift market cap by peer ratios</div>
            <div className="table">
              <div className="table__head">
                <div>Exchange</div>
                <div>Peer P/F</div>
                <div>Peer P/V</div>
                <div>Drift MC @ P/F</div>
                <div>Drift MC @ P/V</div>
                <div>Multiple vs current</div>
              </div>
              <div className="table__body">
                {data.peers.map((peer) => {
                  const pfWidth = maxImplied
                    ? Math.min(((peer.impliedByPF || 0) / maxImplied) * 100, 100)
                    : 0;
                  const pvWidth = maxImplied
                    ? Math.min(((peer.impliedByPV || 0) / maxImplied) * 100, 100)
                    : 0;

                  return (
                    <div className="table__row" key={peer.slug}>
                      <div>
                        <div className="row__title">{peer.name}</div>
                        <div className="row__subtitle">
                          {peer.symbol || peer.slug} · Fees {formatUsdCompact(peer.fees)} · Vol{" "}
                          {formatUsdCompact(peer.volume)}
                        </div>
                      </div>
                      <div className="row__metric">{formatRatio(peer.pf)}</div>
                      <div className="row__metric">{formatRatio(peer.pv)}</div>
                      <div>
                        <div className="bar">
                          <span style={{ width: `${pfWidth}%` }} />
                        </div>
                        <div className="row__metric">{formatUsd(peer.impliedByPF)}</div>
                      </div>
                      <div>
                        <div className="bar bar--alt">
                          <span style={{ width: `${pvWidth}%` }} />
                        </div>
                        <div className="row__metric">{formatUsd(peer.impliedByPV)}</div>
                      </div>
                      <div className="row__metric">
                        {formatRatio(peer.multipleByPF)} / {formatRatio(peer.multipleByPV)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="notice">Loading metrics…</div>
      ) : null}
    </section>
  );
}
