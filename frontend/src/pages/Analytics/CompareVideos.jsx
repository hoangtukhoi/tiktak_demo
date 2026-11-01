import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, GitCompare, Star } from 'lucide-react';
import { compareMyVideos, getMyAnalyticsTab } from '../../api/analytics.api';
import { timeAgo } from '../../utils/format';
import { COLORS, LineChart, Panel, fmtNumber, fmtPct, fmtSeconds } from '../../components/analytics/Charts';
import { SOURCE_LABEL, useLoad } from './shared';

// Chỉ số tính từ lượt xem có đo thời gian → video chưa có lượt nào thì hiện "—" thay vì 0
const tracked = (i, v) => (i.watch.views ? v : null);

/** Bảng chỉ số: [nhãn, lấy giá trị, định dạng, thấp hơn là tốt hơn?] */
const ROWS = [
  ['Thời lượng', (i) => i.video.durationSec, fmtSeconds, null],
  ['Tổng lượt xem', (i) => i.video.totalViews, fmtNumber, false],
  ['Thích', (i) => i.video.likes, fmtNumber, false],
  ['Bình luận', (i) => i.video.comments, fmtNumber, false],
  ['Chia sẻ', (i) => i.video.shares, fmtNumber, false],
  ['Tỷ lệ tương tác', (i) => i.engagementRate, fmtPct, false],
  ['Lượt xem có đo thời gian', (i) => i.watch.views, fmtNumber, null],
  ['Thời gian xem TB', (i) => tracked(i, i.watch.avgWatchSec), fmtSeconds, false],
  ['Xem trung bình', (i) => tracked(i, i.watch.avgWatchedPct), fmtPct, false],
  ['Tỷ lệ xem hết', (i) => tracked(i, i.watch.completionRate), fmtPct, false],
  ['Rời đi trong 3 giây đầu', (i) => tracked(i, i.audience.earlyDropRate), fmtPct, true],
  ['Tỷ lệ xem lại', (i) => tracked(i, i.audience.rewatchRate), fmtPct, false],
  ['Người xem (đã đăng nhập)', (i) => i.audience.uniqueViewers, fmtNumber, false],
];

function Picker({ initial = [] }) {
  const navigate = useNavigate();
  const [picked, setPicked] = useState(initial);
  const { data } = useLoad(() => getMyAnalyticsTab('content', 365), []);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? (toast('Chọn tối đa 3 video'), p) : [...p, id]));
  return (
    <Panel title="Chọn video để so sánh" subtitle="Chọn 2–3 video của bạn">
      {!data ? <div className="skeleton h-60 rounded-2xl" /> : data.videos.length < 2 ? (
        <p className="text-sm text-paper-dim">Cần ít nhất 2 video để so sánh.</p>
      ) : (
        <>
          <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            {data.videos.map((v) => (
              <li key={v._id}>
                <label className={`flex cursor-pointer items-center gap-3 rounded-xl p-2 transition ${picked.includes(v._id) ? 'bg-lime/10' : 'hover:bg-ink-700'}`}>
                  <input type="checkbox" checked={picked.includes(v._id)} onChange={() => toggle(v._id)} className="h-4 w-4" style={{ accentColor: COLORS.primary }} />
                  {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" className="h-12 w-9 rounded-lg object-cover" /> : <span className="h-12 w-9 rounded-lg bg-ink-600" />}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-sm font-semibold">{v.title}</span>
                    <span className="text-xs text-paper-mute">{timeAgo(v.createdAt)} · {fmtNumber(v.totals.views)} lượt xem</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button disabled={picked.length < 2} onClick={() => navigate(`/analytics/compare?ids=${picked.join(',')}`)} className="btn mt-4 w-full">
            <GitCompare size={16} /> So sánh {picked.length ? `(${picked.length})` : ''}
          </button>
        </>
      )}
    </Panel>
  );
}

export default function CompareVideos() {
  const [params] = useSearchParams();
  const ids = (params.get('ids') || '').split(',').filter(Boolean).slice(0, 3);
  const enough = ids.length >= 2;
  const { data, error } = useLoad(() => (enough ? compareMyVideos(ids) : Promise.resolve(null)), [ids.join(',')]);

  const back = (
    <Link to="/analytics?tab=content" className="inline-flex items-center gap-1.5 text-sm font-semibold text-paper-dim hover:text-paper">
      <ArrowLeft size={16} /> Nội dung
    </Link>
  );

  if (!enough || error) {
    return (
      <div className="mx-auto max-w-[760px] px-4 pb-16 pt-5 sm:px-6">
        {back}
        <h1 className="mb-4 mt-3 text-3xl font-extrabold">So sánh video</h1>
        {error && <p className="mb-4 text-sm text-coral">Không so sánh được các video đã chọn. Hãy chọn lại.</p>}
        <Picker initial={ids} />
      </div>
    );
  }

  const items = data?.items || [];
  const colors = COLORS.series;
  const maxDays = Math.max(0, ...items.map((i) => i.sincePublish.length));
  const sinceRows = Array.from({ length: maxDays }, (_, d) => Object.fromEntries([['x', d + 1], ...items.map((it, k) => [`v${k}`, it.sincePublish[d]?.views ?? null])]));
  const hasRetention = items.some((i) => i.retention.length);
  const retentionRows = hasRetention
    ? Array.from({ length: 11 }, (_, s) => Object.fromEntries([['x', s * 10], ...items.map((it, k) => [`v${k}`, it.retention[s]?.pct ?? null])]))
    : [];
  const series = items.map((it, k) => ({ key: `v${k}`, label: it.video.title.length > 28 ? `${it.video.title.slice(0, 28)}…` : it.video.title, color: colors[k] }));

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-16 pt-5 sm:px-6">
      {back}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-extrabold">So sánh video</h1>
        <Link to={`/analytics/compare?pick=1&ids=`} className="btn-ghost !py-1.5 text-sm">Chọn video khác</Link>
      </div>

      {/* Chú thích video ↔ màu */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {(data ? items : ids.map(() => null)).map((it, k) => (
          <div key={k} className="card flex items-center gap-3 p-3" style={{ borderTop: `3px solid ${colors[k]}` }}>
            {it ? (
              <>
                {it.video.thumbnailUrl ? <img src={it.video.thumbnailUrl} alt="" className="h-16 w-12 shrink-0 rounded-lg object-cover" /> : <span className="h-16 w-12 shrink-0 rounded-lg bg-ink-600" />}
                <span className="min-w-0">
                  <span className="line-clamp-2 text-sm font-semibold">{it.video.title}</span>
                  <span className="text-xs text-paper-mute">Video {k + 1} (V{k + 1}) · {timeAgo(it.video.createdAt)}</span>
                </span>
              </>
            ) : <span className="skeleton h-16 w-full rounded-lg" />}
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Lượt xem theo ngày kể từ khi đăng" subtitle="Đặt các video về cùng mốc ngày đăng (tối đa 14 ngày)">
          {!data ? <div className="skeleton h-[240px] rounded-2xl" /> : (
            <LineChart data={sinceRows} series={series} height={240} area={false} xFormat={(x) => `N${x}`} tooltipTitle={(x) => `Ngày thứ ${x} sau khi đăng`} />
          )}
        </Panel>
        <Panel title="Giữ chân người xem" subtitle="% người xem còn ở lại tại mỗi mốc thời lượng">
          {!data ? <div className="skeleton h-[240px] rounded-2xl" /> : hasRetention ? (
            <LineChart data={retentionRows} series={series} height={240} area={false} yMax={100} ySuffix="%" xFormat={(x) => `${x}%`} tooltipTitle={(x) => `Tại ${x}% thời lượng`} />
          ) : <p className="py-10 text-center text-sm text-paper-mute">Chưa có dữ liệu giữ chân</p>}
        </Panel>
      </div>

      <Panel className="mt-4" title="Chỉ số cạnh nhau" subtitle="★ = tốt nhất trong các video đang so sánh · tính từ khi đăng">
        {!data ? <div className="skeleton h-80 rounded-2xl" /> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-600">
                  <th className="label py-3 pl-5 pr-2 text-left font-bold">Chỉ số</th>
                  {items.map((it, k) => (
                    <th key={k} className="whitespace-nowrap px-2 py-3 text-right last:pr-5">
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-paper-dim">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[k] }} /> V{k + 1}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([label, get, fmt, lowerBetter]) => {
                  const vals = items.map(get);
                  const valid = vals.filter((x) => x !== null && x !== undefined);
                  const best = lowerBetter === null || valid.length < 2 || new Set(valid).size === 1 ? null : lowerBetter ? Math.min(...valid) : Math.max(...valid);
                  return (
                    <tr key={label} className="border-b border-ink-700">
                      <td className="py-2.5 pl-5 pr-2 text-paper-dim">{label}</td>
                      {vals.map((val, k) => (
                        <td key={k} className={`whitespace-nowrap px-2 py-2.5 text-right font-mono last:pr-5 ${best !== null && val === best ? 'font-bold text-paper' : ''}`}>
                          {best !== null && val === best && <Star size={12} className="mr-1 inline -translate-y-px text-lime" aria-label="Tốt nhất" />}
                          {fmt(val)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                <tr>
                  <td className="py-2.5 pl-5 pr-2 text-paper-dim">Nguồn chính</td>
                  {items.map((it, k) => (
                    <td key={k} className="px-2 py-2.5 text-right text-xs last:pr-5">{it.topSource?.views ? `${SOURCE_LABEL[it.topSource.source]} (${fmtPct(it.topSource.pct)})` : '—'}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
