import React, { useState } from "react";

// Rounds the top of the scale to a tidy number and returns evenly spaced gridline values
const scale = (max, steps = 4) => {
  if (!(max > 0)) return { top: 1, ticks: [0] };
  const raw = max / steps;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw);
  const top = step * steps;
  return { top, ticks: Array.from({ length: steps + 1 }, (_, i) => step * i) };
};

const Tooltip = ({ left, title, value, detail }) => (
  <div
    className="pointer-events-none absolute top-0 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white shadow-lg whitespace-nowrap z-10"
    style={{ left: `${left}%` }}
  >
    <p className="text-zinc-400">{title}</p>
    <p className="font-semibold tabular-nums text-sm">{value}</p>
    {detail && <p className="text-zinc-400">{detail}</p>}
  </div>
);

// Shown instead of an empty axis when there is nothing to plot
const NoData = ({ height }) => (
  <div className="flex items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 text-sm text-zinc-500" style={{ height }}>
    No sales in this period
  </div>
);

// Shared frame: y-axis labels and gridlines, with the plot drawn inside
const Frame = ({ ticks, top, height, formatAxis, children, labels }) => (
  <div>
    <div className="flex">
      <div className="relative w-12 shrink-0" style={{ height }}>
        {ticks.map((t) => (
          <span key={t} className="absolute right-2 -translate-y-1/2 text-[11px] text-zinc-500 tabular-nums" style={{ top: `${100 - (t / top) * 100}%` }}>
            {formatAxis(t)}
          </span>
        ))}
      </div>
      <div className="relative flex-1 min-w-0" style={{ height }}>
        {ticks.map((t) => (
          <div key={t} className={`absolute inset-x-0 border-t ${t === 0 ? "border-zinc-300" : "border-dashed border-zinc-200"}`} style={{ top: `${100 - (t / top) * 100}%` }} />
        ))}
        {children}
      </div>
    </div>
    <div className="flex ml-12 mt-2">{labels}</div>
  </div>
);

// Single-series columns (e.g. busy hours). data: [{ label, short?, value, detail? }]
export const ColumnChart = ({ data, formatValue, formatAxis = formatValue, height = 200, labelEvery = 1 }) => {
  const [hover, setHover] = useState(null);
  const { top, ticks } = scale(Math.max(...data.map((d) => d.value), 0));
  if (!data.some((d) => d.value > 0)) return <NoData height={height} />;

  return (
    <div onMouseLeave={() => setHover(null)}>
      <Frame
        ticks={ticks}
        top={top}
        height={height}
        formatAxis={formatAxis}
        labels={data.map((d, i) => (
          <div key={d.label} className="flex-1 min-w-0 flex justify-center whitespace-nowrap text-[11px] text-zinc-500 tabular-nums">
            {i % labelEvery === 0 ? d.short || d.label : ""}
          </div>
        ))}
      >
        <div className="absolute inset-0 flex items-end">
          {data.map((d, i) => (
            <div key={d.label} onMouseEnter={() => setHover(i)} className="relative flex-1 h-full flex items-end justify-center px-[3px]">
              <div
                className={`w-full max-w-[28px] rounded-t transition-colors ${hover === i ? "bg-brand-600" : "bg-brand-500"}`}
                style={{ height: `${(d.value / top) * 100}%`, minHeight: d.value > 0 ? 3 : 0 }}
              />
            </div>
          ))}
        </div>
        {hover !== null && (
          <Tooltip left={((hover + 0.5) / data.length) * 100} title={data[hover].label} value={formatValue(data[hover].value)} detail={data[hover].detail} />
        )}
      </Frame>
    </div>
  );
};

// Single-series trend line with a soft fill and a hover crosshair. data: [{ label, short?, value, detail? }]
export const AreaChart = ({ data, formatValue, formatAxis = formatValue, height = 220, labelEvery = 1 }) => {
  const [hover, setHover] = useState(null);
  const { top, ticks } = scale(Math.max(...data.map((d) => d.value), 0));
  const n = data.length;
  if (!data.some((d) => d.value > 0)) return <NoData height={height} />;
  const x = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v) => 100 - (v / top) * 100;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join(" ");
  const area = `${line} L${x(n - 1)},100 L${x(0)},100 Z`;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1)))));
  };

  return (
    <Frame
      ticks={ticks}
      top={top}
      height={height}
      formatAxis={formatAxis}
      labels={
        <div className="relative w-full h-4">
          {data.map((d, i) =>
            i % labelEvery === 0 || (i === n - 1 && (n - 1) % labelEvery >= labelEvery / 2) ? (
              <span key={d.label} className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] text-zinc-500 tabular-nums" style={{ left: `${x(i)}%` }}>
                {d.short || d.label}
              </span>
            ) : null
          )}
        </div>
      }
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(249 115 22)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(249 115 22)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#area-fill)" />
        <path d={line} fill="none" stroke="rgb(234 88 12)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {hover !== null && (
        <>
          <div className="absolute top-0 bottom-0 border-l border-zinc-300 pointer-events-none" style={{ left: `${x(hover)}%` }} />
          <div
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600 ring-2 ring-white pointer-events-none"
            style={{ left: `${x(hover)}%`, top: `${y(data[hover].value)}%` }}
          />
          <Tooltip left={x(hover)} title={data[hover].label} value={formatValue(data[hover].value)} detail={data[hover].detail} />
        </>
      )}
      <div className="absolute inset-0" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
    </Frame>
  );
};

// Ranked horizontal bars with value and share. rows: [{ label, value, detail? }]
export const BarList = ({ rows, formatValue, empty = "No data yet" }) => {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  if (rows.length === 0) return <p className="text-sm text-zinc-500 py-8 text-center">{empty}</p>;

  return (
    <ul className="space-y-3.5">
      {rows.map((row) => (
        <li key={row.label} title={row.detail}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-zinc-800">{row.label}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium text-zinc-900">{formatValue(row.value)}</span>
              <span className="ml-2 inline-block w-9 text-right text-xs text-zinc-500">{Math.round((row.value / total) * 100)}%</span>
            </span>
          </div>
          <div className="h-1.5 mt-1.5 rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
};

// A chart or list inside a titled card, with an optional figure on the right
export const ChartCard = ({ title, aside, children, className = "" }) => (
  <div className={`card p-5 ${className}`}>
    <div className="flex items-baseline justify-between gap-3 mb-5">
      <h2 className="card-title">{title}</h2>
      {aside && <div className="text-sm font-medium text-zinc-600 tabular-nums">{aside}</div>}
    </div>
    {children}
  </div>
);
