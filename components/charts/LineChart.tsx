import React, { useMemo } from "react";

export type LineSeries = {
  label: string;
  color: string;
  values: Array<{ date: string; value: number | null | undefined }>;
};

type LineChartProps = {
  title: string;
  subtitle?: string;
  series: LineSeries[];
  height?: number;
};

const buildPath = (points: Array<[number, number]>) => {
  if (!points.length) return "";
  return points.map((point, idx) => `${idx === 0 ? "M" : "L"}${point[0]} ${point[1]}`).join(" ");
};

export default function LineChart({ title, subtitle, series, height = 180 }: LineChartProps) {
  const { paths, minValue, maxValue } = useMemo(() => {
    const values = series.flatMap((item) => item.values.map((entry) => entry.value ?? null));
    const numeric = values.filter((val): val is number => typeof val === "number" && Number.isFinite(val));
    const minValue = numeric.length ? Math.min(...numeric) : 0;
    const maxValue = numeric.length ? Math.max(...numeric) : 1;
    const range = maxValue - minValue || 1;

    const paths = series.map((item) => {
      const filtered = item.values.filter((entry) => typeof entry.value === "number");
      const points: Array<[number, number]> = [];
      const count = item.values.length || 1;
      item.values.forEach((entry, index) => {
        if (typeof entry.value !== "number") return;
        const x = (index / (count - 1 || 1)) * 100;
        const y = 100 - ((entry.value - minValue) / range) * 100;
        points.push([x, y]);
      });
      return {
        label: item.label,
        color: item.color,
        path: buildPath(points),
        hasData: filtered.length > 1
      };
    });

    return { paths, minValue, maxValue };
  }, [series]);

  return (
    <div className="chart-card">
      <div className="chart-card__header">
        <div>
          <div className="chart-card__title">{title}</div>
          {subtitle ? <div className="chart-card__subtitle">{subtitle}</div> : null}
        </div>
        <div className="chart-card__range">
          {minValue.toLocaleString()} → {maxValue.toLocaleString()}
        </div>
      </div>
      <div className="chart-card__body">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }}>
          <defs>
            <linearGradient id="grid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0,0,0,0.08)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.02)" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="100" height="100" fill="url(#grid)" opacity="0.35" />
          <line x1="0" y1="100" x2="100" y2="100" stroke="rgba(0,0,0,0.2)" strokeWidth="0.4" />
          {paths.map((item) =>
            item.hasData ? (
              <path
                key={item.label}
                d={item.path}
                fill="none"
                stroke={item.color}
                strokeWidth="1.4"
                vectorEffect="non-scaling-stroke"
              />
            ) : null
          )}
        </svg>
        <div className="chart-card__legend">
          {paths.map((item) => (
            <div key={item.label} className="legend-item">
              <span className="legend-swatch" style={{ backgroundColor: item.color }} />
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
