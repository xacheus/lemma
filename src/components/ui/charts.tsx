'use client';

import { useState } from 'react';

export interface Point {
  label: string;
  value: number;
  sub?: string;
}

const PAD = { top: 12, right: 10, bottom: 24, left: 44 };

function niceCeil(value: number) {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Revenue over the last fortnight, with a hover read-out. */
export function AreaChart({
  data,
  height = 170,
  format,
  tone = 'navy',
}: {
  data: Point[];
  height?: number;
  format: (n: number) => string;
  tone?: 'navy' | 'teal';
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const max = niceCeil(Math.max(1, ...data.map((d) => d.value)));
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length <= 1 ? innerW / 2 : (i * innerW) / (data.length - 1));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;
  const stroke = tone === 'teal' ? '#1d756e' : '#2f4c74';
  const fill = tone === 'teal' ? 'rgba(29,117,110,0.14)' : 'rgba(47,76,116,0.13)';
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));

  if (!data.length) {
    return <p className="py-8 text-center text-[0.82rem] text-navy-400">No data in this period.</p>;
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Revenue by day">
        <defs>
          <linearGradient id={`grad-${tone}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fill} />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="#ece7dd" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize="9.5" fill="#7d94b6">
              {format(t)}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#grad-${tone})`} />
        <path d={line} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={d.label}>
            {hover === i ? <line x1={x(i)} x2={x(i)} y1={PAD.top} y2={PAD.top + innerH} stroke={stroke} strokeDasharray="2 3" strokeWidth={1} /> : null}
            <circle cx={x(i)} cy={y(d.value)} r={hover === i ? 4 : 2.4} fill="#fff" stroke={stroke} strokeWidth={1.6} />
            <rect
              x={x(i) - innerW / (data.length * 2)}
              y={PAD.top}
              width={innerW / data.length}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            />
            {i % Math.ceil(data.length / 7) === 0 ? (
              <text x={x(i)} y={height - 7} textAnchor="middle" fontSize="9.5" fill="#7d94b6">
                {d.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      {hover !== null ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-md border border-sand-200 bg-white px-2 py-1 text-[0.72rem] shadow-card"
          style={{ left: `${((x(hover) - 0) / width) * 100}%`, top: 0 }}
        >
          <span className="font-semibold text-navy-800">{format(data[hover].value)}</span>
          <span className="ml-1 text-navy-400">{data[hover].sub ?? data[hover].label}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Occupancy by month, drawn as bars with the percentage printed on hover. */
export function BarChart({
  data,
  height = 168,
  max = 100,
  unit = '%',
  tone = 'teal',
}: {
  data: (Point & { detail?: string })[];
  height?: number;
  max?: number;
  unit?: string;
  tone?: 'teal' | 'gold' | 'navy';
}) {
  const [hover, setHover] = useState<number | null>(null);
  const innerH = height - PAD.bottom - 8;
  const color = tone === 'gold' ? '#cba33f' : tone === 'navy' ? '#2f4c74' : '#1d756e';
  if (!data.length) return <p className="py-8 text-center text-[0.82rem] text-navy-400">Nothing to chart yet.</p>;
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => {
        const h = Math.max(2, (Math.min(d.value, max) / max) * innerH);
        return (
          <div
            key={d.label}
            className="group relative flex flex-1 flex-col items-center justify-end gap-1.5"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i ? (
              <div className="absolute -top-1 z-10 whitespace-nowrap rounded-md border border-sand-200 bg-white px-2 py-1 text-[0.7rem] shadow-card">
                <span className="font-semibold text-navy-800">
                  {d.value}
                  {unit}
                </span>
                {d.detail ? <span className="ml-1 text-navy-400">{d.detail}</span> : null}
              </div>
            ) : null}
            <div
              className="w-full rounded-t-[3px] transition-all"
              style={{ height: h, background: hover === i ? color : `${color}cc` }}
              title={`${d.label}: ${d.value}${unit}`}
            />
            <span className="text-[0.68rem] font-medium text-navy-400">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DonutChart({
  slices,
  size = 148,
  centreLabel,
  centreValue,
  format,
}: {
  slices: { label: string; value: number; color: string }[];
  size?: number;
  centreLabel?: string;
  centreValue?: string;
  format: (n: number) => string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Payment method breakdown">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f6f3ed" strokeWidth={14} />
          {total > 0 &&
            slices.map((s) => {
              const length = (s.value / total) * circumference;
              const dash = `${length} ${circumference - length}`;
              const el = (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={14}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                >
                  <title>{`${s.label}: ${format(s.value)}`}</title>
                </circle>
              );
              offset += length;
              return el;
            })}
        </g>
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f1f35">
          {centreValue}
        </text>
        <text x={size / 2} y={size / 2 + 13} textAnchor="middle" fontSize="9" fill="#7d94b6">
          {centreLabel}
        </text>
      </svg>
      <ul className="min-w-[9rem] flex-1 space-y-1.5">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3 text-[0.8rem]">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate text-navy-600">{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums font-semibold text-navy-800">
              {format(s.value)}
              <span className="ml-1 text-[0.7rem] font-normal text-navy-400">{total ? Math.round((s.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sparkline({ values, tone = '#1d756e', height = 26 }: { values: number[]; tone?: string; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${height - ((v - min) / span) * (height - 4) - 2}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-[26px] w-full" aria-hidden>
      <polyline points={points} fill="none" stroke={tone} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function LegendSwatches({ items }: { items: { label: string; className: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-[0.72rem] font-medium text-navy-500">
          <span className={`h-2.5 w-2.5 rounded-[3px] ${item.className}`} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
