import React, { useMemo } from "react";

type ScatterPoint = {
  x: number;
  y: number;
};

type ScatterPlotProps = {
  title: string;
  subtitle?: string;
  points: ScatterPoint[];
  height?: number;
  xLabel: string;
  yLabel: string;
  correlation: number | null;
};

export default function ScatterPlot({
  title,
  subtitle,
  points,
  height = 200,
  xLabel,
  yLabel,
  correlation
}: ScatterPlotProps) {
  const { minX, maxX, minY, maxY, scaledPoints } = useMemo(() => {
    const xs = points.map((p) => p.x).filter((v) => Number.isFinite(v));
    const ys = points.map((p) => p.y).filter((v) => Number.isFinite(v));
    const minX = xs.length ? Math.min(...xs) : 0;
    const maxX = xs.length ? Math.max(...xs) : 1;
    const minY = ys.length ? Math.min(...ys) : 0;
    const maxY = ys.length ? Math.max(...ys) : 1;
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    const scaledPoints = points.map((p) => ({
      cx: ((p.x - minX) / rangeX) * 100,
      cy: 100 - ((p.y - minY) / rangeY) * 100
    }));

    return { minX, maxX, minY, maxY, scaledPoints };
  }, [points]);

  return (
    <div className="scatter-card">
      <div className="scatter-card__header">
        <div>
          <div className="scatter-card__title">{title}</div>
          {subtitle ? <div className="scatter-card__subtitle">{subtitle}</div> : null}
        </div>
        <div className="scatter-card__corr">
          {correlation === null ? "—" : `ρ ${correlation.toFixed(2)}`}
        </div>
      </div>
      <div className="scatter-card__body">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }}>
          <rect x="0" y="0" width="100" height="100" fill="rgba(0,0,0,0.03)" />
          <line x1="0" y1="100" x2="100" y2="100" stroke="rgba(0,0,0,0.2)" strokeWidth="0.4" />
          <line x1="0" y1="0" x2="0" y2="100" stroke="rgba(0,0,0,0.2)" strokeWidth="0.4" />
          {scaledPoints.map((point, idx) => (
            <circle key={idx} cx={point.cx} cy={point.cy} r="1.2" fill="#111" opacity="0.55" />
          ))}
        </svg>
        <div className="scatter-card__axes">
          <span>{xLabel}</span>
          <span>{yLabel}</span>
        </div>
        <div className="scatter-card__range">
          <span>{minX.toLocaleString()}</span>
          <span>{maxX.toLocaleString()}</span>
          <span>{maxY.toLocaleString()}</span>
          <span>{minY.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
