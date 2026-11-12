import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatCount } from '../../utils/format';

/**
 * Bộ biểu đồ SVG nhẹ, không phụ thuộc thư viện ngoài.
 * Quy ước: nét 2px, lưới mảnh 1px, đầu cột bo 4px, vùng tô 10% độ đậm,
 * chữ luôn dùng màu chữ (không dùng màu dữ liệu), có tooltip khi rê chuột.
 *
 * Màu: 1 chuỗi → màu thương hiệu (son); nhiều chuỗi → bảng màu đã kiểm tra
 * khả năng phân biệt cho người mù màu trên nền tối.
 */
// Lấy từ CSS variable của theme (src/index.css) → tự đổi theo chế độ sáng / tối
export const COLORS = {
  primary: 'rgb(var(--brand))',
  series: ['#3987e5', '#d95926', '#199e70', '#c98500'], // xanh, cam, ngọc, vàng (thứ tự cố định)
  surface: 'rgb(var(--surface))',
  grid: 'rgb(var(--line))',
  axis: 'rgb(var(--fg-subtle))',
  text: 'rgb(var(--fg))',
  textDim: 'rgb(var(--fg-muted))',
};

// ── Tiện ích ────────────────────────────────────────────────────────────────

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Mốc trục y "tròn": 0, 5, 10… hoặc 0, 1K, 2K… */
function niceTicks(max, count = 4) {
  if (max <= 0) return [0, 1];
  // Dữ liệu dạng đếm → bước tối thiểu là 1 (không có "0,25 lượt xem")
  const raw = Math.max(1, max / count);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) || raw;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => +(i * step).toFixed(10));
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const WEEKDAYS_FULL = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
export const shortDate = (iso) => {
  const [, m, d] = iso.split('-');
  return `${+d}/${+m}`;
};
const longDate = (iso) => {
  const dt = new Date(`${iso}T12:00:00`);
  return `${WEEKDAYS_FULL[(dt.getDay() + 6) % 7]}, ${shortDate(iso)}`;
};

export const fmtNumber = (n) => (n === null || n === undefined ? '—' : n >= 10000 ? formatCount(n) : n.toLocaleString('vi-VN'));
export const fmtSeconds = (s) => {
  if (s === null || s === undefined) return '—';
  if (s < 60) return `${s.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}s`;
  if (s < 3600) return `${Math.floor(s / 60)}p ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600).toLocaleString('vi-VN')} giờ ${Math.round((s % 3600) / 60)}p`;
};
export const fmtPct = (p) => (p === null || p === undefined ? '—' : `${p.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`);

// ── Thẻ chỉ số (KPI) ────────────────────────────────────────────────────────

/** metric = { value, previous, change } từ API; `invert` khi giảm là tốt */
export function StatTile({ label, metric, format = fmtNumber, hint, invert = false }) {
  const change = metric?.change;
  const up = change > 0;
  const flat = change === 0;
  const good = flat ? null : invert ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="card p-5">
      {/* text-balance: nhãn dài xuống dòng cân 2 dòng (VD "Người dùng / hoạt động") thay vì để 1 chữ lẻ */}
      <p className="label text-balance">{label}</p>
      <p className="mt-3 tabular text-3xl font-bold tracking-tighter sm:text-4xl">{metric ? format(metric.value) : <span className="skeleton inline-block h-9 w-24 rounded-lg" />}</p>
      <div className="mt-2 flex min-h-[20px] items-center gap-1.5 text-xs">
        {metric && change === null && metric.value > 0 && <span className="font-semibold text-fg-muted">Mới trong kỳ này</span>}
        {metric && change !== null && change !== undefined && (
          <>
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 tabular font-bold"
              style={{ background: good === null ? 'rgb(var(--surface-3))' : good ? 'rgb(var(--success) / .14)' : 'rgb(var(--danger) / .14)', color: COLORS.text }}
            >
              <Icon size={13} style={{ color: good === null ? COLORS.textDim : good ? 'rgb(var(--success))' : 'rgb(var(--danger))' }} />
              {flat ? '0%' : `${up ? '+' : ''}${change.toLocaleString('vi-VN')}%`}
            </span>
            <span className="text-fg-subtle">so với kỳ trước</span>
          </>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

// ── Biểu đồ đường theo thời gian ────────────────────────────────────────────

/**
 * data: [{ date: '2026-11-01', ...values }]
 * series: [{ key, label, color? }]
 */
export function LineChart({ data, series, height = 240, yFormat = fmtNumber, xFormat = shortDate, tooltipTitle = longDate, area = true, ySuffix = '', yMax }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const gid = useId().replace(/:/g, '');
  const multi = series.length > 1;
  const colorOf = (s, i) => s.color || (multi ? COLORS.series[i] : COLORS.primary);

  const pad = { t: 14, r: 16, b: 28, l: 44 };
  const W = Math.max(width, 200);
  const H = height;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const max = yMax ?? Math.max(0, ...data.flatMap((d) => series.map((s) => d[s.key] || 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const x = (i) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v) => pad.t + ih - ((v || 0) / top) * ih;

  // Nhãn trục x: tối đa ~6 mốc, luôn có điểm đầu và cuối
  // Số nhãn tuỳ theo bề rộng (mỗi nhãn cần ~52px), luôn giữ điểm đầu và cuối
  const xLabelIdx = useMemo(() => {
    const n = data.length;
    if (n <= 1) return [0];
    const maxLabels = Math.max(2, Math.min(7, Math.floor(iw / 52)));
    const step = Math.max(1, Math.ceil((n - 1) / (maxLabels - 1)));
    const idx = [];
    for (let i = 0; i < n; i += step) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) {
      // bỏ nhãn áp chót nếu quá sát nhãn cuối
      if ((n - 1 - idx[idx.length - 1]) * (iw / (n - 1)) < 52) idx.pop();
      idx.push(n - 1);
    }
    return idx;
  }, [data, iw]);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - pad.l) / iw) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  const last = data.length - 1;
  return (
    <div ref={ref} className="relative w-full min-w-0 select-none overflow-x-clip">
      {multi && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s, i) => (
            <span key={s.key} className="inline-flex items-center gap-2 text-xs font-semibold text-fg-muted">
              <span className="h-[3px] w-4 rounded-full" style={{ background: colorOf(s, i) }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      {width > 0 && (
        <svg width={W} height={H} role="img" aria-label={series.map((s) => s.label).join(', ')} onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ display: 'block', touchAction: 'pan-y' }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`${gid}-${i}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={colorOf(s, i)} stopOpacity={multi ? 0.08 : 0.16} />
                <stop offset="100%" stopColor={colorOf(s, i)} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={COLORS.grid} strokeWidth="1" />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill={COLORS.axis} fontFamily="JetBrains Mono, monospace">
                {yFormat(t)}{ySuffix}
              </text>
            </g>
          ))}
          {xLabelIdx.map((i) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} fontSize="11" fill={COLORS.axis} fontFamily="JetBrains Mono, monospace">
              {xFormat(data[i].date ?? data[i].x)}
            </text>
          ))}
          {series.map((s, si) => {
            // null = không có dữ liệu → ngắt đường (không vẽ như giá trị 0)
            const pts = data.map((d, i) => (d[s.key] === null || d[s.key] === undefined ? null : [x(i), y(d[s.key])]));
            let line = '';
            pts.forEach((p, i) => {
              if (!p) return;
              line += `${i === 0 || !pts[i - 1] ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
            });
            const valid = pts.filter(Boolean);
            const end = valid[valid.length - 1];
            const allPresent = valid.length === pts.length;
            return (
              <g key={s.key}>
                {area && allPresent && line && <path d={`${line}L${x(last)},${y(0)}L${x(0)},${y(0)}Z`} fill={`url(#${gid}-${si})`} />}
                {line && <path d={line} fill="none" stroke={colorOf(s, si)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
                {/* điểm cuối */}
                {end && <circle cx={end[0]} cy={end[1]} r="4" fill={colorOf(s, si)} stroke={COLORS.surface} strokeWidth="2" />}
              </g>
            );
          })}
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke={COLORS.axis} strokeWidth="1" />
              {series.map((s, si) => (data[hover][s.key] === null || data[hover][s.key] === undefined ? null : (
                <circle key={s.key} cx={x(hover)} cy={y(data[hover][s.key])} r="5" fill={colorOf(s, si)} stroke={COLORS.surface} strokeWidth="2" />
              )))}
            </g>
          )}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 min-w-[140px] rounded-xl border border-line bg-bg/95 px-3 py-2 text-xs shadow-xl"
          // tooltip đặt bên phải điểm đang rê, lật sang trái khi gần mép phải
          style={{ top: multi ? 28 : 0, left: x(hover) > W / 2 ? Math.max(0, x(hover) - 172) : x(hover) + 12 }}
        >
          <p className="mb-1 font-semibold text-fg-muted">{tooltipTitle(data[hover].date ?? data[hover].x)}</p>
          {series.map((s, si) => (
            <p key={s.key} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-fg-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: colorOf(s, si) }} />
                {s.label}
              </span>
              <span className="tabular font-bold text-fg">{data[hover][s.key] === null || data[hover][s.key] === undefined ? '—' : `${yFormat(data[hover][s.key] || 0)}${ySuffix}`}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cột dọc (ít điểm, có nhãn trên đầu cột) ─────────────────────────────────

/** data: [{ label, value, title? }] */
export function ColumnChart({ data, height = 180, format = fmtNumber }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { t: 22, b: 26, l: 8, r: 8 };
  const W = Math.max(width, 160);
  const ih = height - pad.t - pad.b;
  const band = (W - pad.l - pad.r) / Math.max(data.length, 1);
  const bw = Math.min(24, band * 0.6);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-x-clip">
      {width > 0 && (
        <svg width={W} height={height} role="img" aria-label="Biểu đồ cột" style={{ display: 'block' }}>
          <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke={COLORS.grid} />
          {data.map((d, i) => {
            const h = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * ih);
            const cx = pad.l + band * i + band / 2;
            const y0 = pad.t + ih;
            const r = Math.min(4, h / 2, bw / 2);
            // cột bo 4px ở đầu, vuông ở chân
            const path = h > 0
              ? `M${cx - bw / 2},${y0}V${y0 - h + r}Q${cx - bw / 2},${y0 - h} ${cx - bw / 2 + r},${y0 - h}H${cx + bw / 2 - r}Q${cx + bw / 2},${y0 - h} ${cx + bw / 2},${y0 - h + r}V${y0}Z`
              : '';
            return (
              <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <rect x={cx - band / 2} y={pad.t} width={band} height={ih + pad.b} fill="transparent" />
                {path && <path d={path} fill={COLORS.primary} opacity={hover === null || hover === i ? 1 : 0.45} />}
                <text x={cx} y={y0 - h - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill={COLORS.text} fontFamily="JetBrains Mono, monospace">{format(d.value)}</text>
                <text x={cx} y={height - 8} textAnchor="middle" fontSize="11" fill={COLORS.axis} fontFamily="JetBrains Mono, monospace">{d.label}</text>
                {d.title && <title>{d.title}</title>}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// ── Thanh ngang có nhãn (nguồn lượt xem, lý do báo cáo, hashtag…) ───────────

/** items: [{ label, value, sub? }] */
export function BarList({ items, format = fmtNumber, color = COLORS.primary, empty = 'Chưa có dữ liệu' }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length || items.every((i) => !i.value)) return <p className="py-6 text-center text-sm text-fg-subtle">{empty}</p>;
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <li key={it.label} title={`${it.label}: ${format(it.value)}${it.sub ? ` · ${it.sub}` : ''}`}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-semibold">{it.label}</span>
            <span className="shrink-0 tabular text-xs text-fg-muted">
              <span className="font-bold text-fg">{format(it.value)}</span>
              {it.sub && <span className="ml-1.5">{it.sub}</span>}
            </span>
          </div>
          <div className="h-2 w-full rounded-full" style={{ background: 'rgb(var(--surface-3))' }}>
            <div className="h-2 rounded-full" style={{ width: `${Math.max(it.value ? 2 : 0, (it.value / max) * 100)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Bản đồ nhiệt thứ × giờ ──────────────────────────────────────────────────

/** grid: 7 hàng (T2..CN) × 24 cột (giờ) */
export function Heatmap({ grid }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...grid.flat());
  const level = (v) => (v === 0 ? 0 : 0.18 + 0.82 * (v / max));
  return (
    <div className="relative">
      <div className="overflow-x-auto no-scrollbar">
        <div className="min-w-[520px]">
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: '28px repeat(24, minmax(0, 1fr))' }}>
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="text-center tabular text-[9px] text-fg-subtle">{h % 3 === 0 ? h : ''}</span>
            ))}
            {grid.map((row, d) => (
              <Row key={d} d={d} row={row} level={level} setHover={setHover} />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-fg-subtle">
        <span className="min-h-[16px]">
          {hover ? (
            <span className="text-fg"><b className="tabular">{fmtNumber(hover.v)}</b> lượt xem · {WEEKDAYS_FULL[hover.d]}, {hover.h}:00–{hover.h + 1}:00</span>
          ) : 'Rê chuột lên ô để xem chi tiết'}
        </span>
        <span className="flex items-center gap-1.5">
          Ít
          {[0, 0.25, 0.5, 0.75, 1].map((l) => (
            <span key={l} className="h-3 w-3 rounded-[3px]" style={{ background: l === 0 ? 'rgb(var(--surface-2))' : COLORS.primary, opacity: l === 0 ? 1 : 0.18 + 0.82 * l }} />
          ))}
          Nhiều
        </span>
      </div>
    </div>
  );
}

function Row({ d, row, level, setHover }) {
  return (
    <>
      <span className="self-center tabular text-[10px] text-fg-subtle">{WEEKDAYS[d]}</span>
      {row.map((v, h) => (
        <span
          key={h}
          className="aspect-square rounded-[3px]"
          style={{ background: v === 0 ? 'rgb(var(--surface-2))' : COLORS.primary, opacity: v === 0 ? 1 : level(v) }}
          onPointerEnter={() => setHover({ d, h, v })}
          onPointerLeave={() => setHover(null)}
          title={`${WEEKDAYS_FULL[d]} ${h}:00 — ${v} lượt xem`}
        />
      ))}
    </>
  );
}

// ── Bộ chọn khoảng thời gian ────────────────────────────────────────────────

export function RangeTabs({ value, onChange, options }) {
  return (
    <div className="flex gap-1 rounded-full bg-surface p-1" role="tablist" aria-label="Khoảng thời gian">
      {options.map(([v, label]) => (
        <button
          key={v}
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${value === v ? 'bg-brand text-white' : 'text-fg-muted hover:text-fg'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Khung card có tiêu đề + phụ đề + (tuỳ chọn) bảng số liệu thay thế */
export function Panel({ title, subtitle, action, children, className = '', table }) {
  return (
    <section className={`card min-w-0 p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
      {table && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer select-none text-xs font-semibold text-fg-subtle hover:text-fg">Xem dạng bảng</summary>
          <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-line">{table}</div>
        </details>
      )}
    </section>
  );
}

/** Bảng số liệu đơn giản cho phần "Xem dạng bảng" */
export function DataTable({ columns, rows }) {
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-surface-2">
        <tr>{columns.map((c) => <th key={c.key} className={`px-3 py-2 tabular font-bold text-fg-muted ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-line">
            {columns.map((c) => <td key={c.key} className={`px-3 py-1.5 ${c.align === 'right' ? 'text-right tabular' : ''}`}>{c.format ? c.format(r[c.key], r) : r[c.key]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function EmptyNote({ children }) {
  return <div className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-fg-muted">{children}</div>;
}

// ── Thẻ số liệu bấm được (chọn chỉ số cho biểu đồ bên dưới) ────────────────

/** Định dạng thay đổi: "▼ −3 (−37,5%)" — mũi tên + dấu, không chỉ dựa vào màu */
export function DeltaText({ metric, format = fmtNumber, invert = false }) {
  if (!metric || metric.delta === undefined || metric.delta === null) return <span className="text-fg-subtle">—</span>;
  const { delta, change } = metric;
  if (delta === 0) return <span className="text-fg-subtle">0 (0%)</span>;
  const up = delta > 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1" style={{ color: good ? 'rgb(var(--success))' : 'rgb(var(--danger))' }}>
      <Icon size={14} aria-hidden />
      <span className="tabular">
        {up ? '+' : '−'}{format(Math.abs(delta))}
        {change !== null && change !== undefined ? ` (${up ? '+' : '−'}${Math.abs(change).toLocaleString('vi-VN')}%)` : ' (mới)'}
      </span>
    </span>
  );
}

/**
 * Lưới thẻ chỉ số kiểu TikTok Studio. Bấm một thẻ để chọn chỉ số hiển thị trên biểu đồ.
 * items: [{ key, label, metric, format?, hint? }]
 */
export function MetricCards({ items, selected, onSelect, cols = 'grid-cols-2' }) {
  return (
    <div className={`grid gap-3 ${cols}`} role="tablist" aria-label="Chỉ số">
      {items.map((it) => {
        const active = it.key === selected;
        const fmt = it.format || fmtNumber;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect?.(it.key)}
            disabled={!onSelect}
            className={`rounded-2xl border p-4 text-left transition ${active ? 'border-brand bg-brand/[0.07]' : 'border-line bg-surface hover:border-line'} ${onSelect ? '' : 'cursor-default'}`}
          >
            <p className="text-sm font-semibold text-fg-muted">{it.label}</p>
            <p className="mt-2 tabular text-3xl font-bold tracking-tighter">
              {it.metric ? fmt(it.metric.value) : <span className="skeleton inline-block h-8 w-16 rounded-lg" />}
            </p>
            <p className="mt-2 min-h-[18px] text-xs">
              {it.hint ? <span className="text-fg-subtle">{it.hint}</span> : it.metric && <DeltaText metric={it.metric} format={fmt} invert={it.invert} />}
            </p>
          </button>
        );
      })}
    </div>
  );
}

// ── Biểu đồ cột có tooltip (giờ trong ngày, thứ trong tuần, 7 ngày đầu…) ────

/** data: [{ label, value, tip }] — label rỗng thì không in nhãn trục (cho 24 giờ) */
export function BarChart({ data, height = 200, format = fmtNumber, showValues = false, unit = '' }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { t: showValues ? 22 : 12, b: 26, l: 30, r: 6 };
  const W = Math.max(width, 160);
  const ih = height - pad.t - pad.b;
  const n = Math.max(data.length, 1);
  const band = (W - pad.l - pad.r) / n;
  const bw = Math.max(3, Math.min(24, band * 0.62));
  const ticks = niceTicks(Math.max(0, ...data.map((d) => d.value)), 3);
  const top = ticks[ticks.length - 1] || 1;
  const y = (v) => pad.t + ih - (v / top) * ih;
  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-x-clip select-none">
      {width > 0 && (
        <svg width={W} height={height} role="img" aria-label="Biểu đồ cột" style={{ display: 'block' }} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={COLORS.grid} />
              <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill={COLORS.axis} fontFamily="JetBrains Mono, monospace">{format(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.l + band * i + band / 2;
            const h = d.value > 0 ? Math.max(2, (d.value / top) * ih) : 0;
            const y0 = pad.t + ih;
            const r = Math.min(4, h / 2, bw / 2);
            const path = h > 0
              ? `M${cx - bw / 2},${y0}V${y0 - h + r}Q${cx - bw / 2},${y0 - h} ${cx - bw / 2 + r},${y0 - h}H${cx + bw / 2 - r}Q${cx + bw / 2},${y0 - h} ${cx + bw / 2},${y0 - h + r}V${y0}Z`
              : '';
            return (
              <g key={i} onPointerEnter={() => setHover(i)}>
                <rect x={cx - band / 2} y={pad.t} width={band} height={ih} fill="transparent" />
                {path && <path d={path} fill={COLORS.primary} opacity={hover === null || hover === i ? 1 : 0.4} />}
                {showValues && <text x={cx} y={y0 - h - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill={COLORS.text} fontFamily="JetBrains Mono, monospace">{format(d.value)}</text>}
                {d.label && <text x={cx} y={height - 8} textAnchor="middle" fontSize="11" fill={COLORS.axis} fontFamily="JetBrains Mono, monospace">{d.label}</text>}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-xl border border-line bg-bg/95 px-3 py-1.5 text-xs shadow-xl"
          style={{ left: Math.min(Math.max(pad.l + band * hover + band / 2 - 50, 0), W - 110) }}
        >
          <p className="text-fg-muted">{data[hover].tip || data[hover].label}</p>
          <p className="tabular font-bold text-fg">{format(data[hover].value)}{unit}</p>
        </div>
      )}
    </div>
  );
}

/** Ngày dạng "24 tháng 10" */
export const viDate = (iso) => {
  const [, m, d] = iso.split('-');
  return `${+d} tháng ${+m}`;
};
