import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { RANGES, RangePills, SOURCE_LABEL, periodText, useLoad } from './shared';
import { ArrowLeft, ChevronLeft, ChevronRight, GitCompare, Lock, Play } from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import { getMyAnalyticsTab } from '../../api/analytics.api';
import { formatCount, timeAgo } from '../../utils/format';
import {
  BarChart, BarList, EmptyNote, LineChart, MetricCards, Panel, fmtNumber, fmtPct, fmtSeconds, viDate,
} from '../../components/analytics/Charts';

export { default as VideoAnalytics } from './VideoAnalytics';
export { default as CompareVideos } from './CompareVideos';
export { RANGES, RangePills, SOURCE_LABEL, periodText, useLoad };

const TABS = [['overview', 'Tổng quan'], ['content', 'Nội dung'], ['viewers', 'Người xem'], ['followers', 'Followers']];
const WEEKDAY_FULL = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
const WEEKDAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const sk = (h) => <div className="skeleton rounded-2xl" style={{ height: h }} />;

// ═════════════════════════════════════════════════════════════════════════════
// Khung trang: /analytics?tab=overview|content|viewers|followers&range=7|28|60|365
// ═════════════════════════════════════════════════════════════════════════════

export default function Analytics() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'overview';
  const range = RANGES.some(([v]) => v === Number(params.get('range'))) ? Number(params.get('range')) : 7;
  const set = (patch) => setParams((p) => {
    const next = new URLSearchParams(p);
    Object.entries(patch).forEach(([k, v]) => next.set(k, String(v)));
    return next;
  }, { replace: true });

  return (
    <div className="mx-auto max-w-[1100px] pb-16">
      <header className="sticky top-0 z-20 border-b border-ink-600 bg-ink/95 backdrop-blur">
        <div className="relative flex items-center justify-center px-4 py-4">
          <button onClick={() => (history.length > 1 ? navigate(-1) : navigate('/'))} className="absolute left-3 grid h-10 w-10 place-items-center rounded-full hover:bg-ink-700" aria-label="Quay lại">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-xl font-extrabold">Phân tích</h1>
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-2" role="tablist" aria-label="Mục phân tích">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => set({ tab: k })}
              className={`relative shrink-0 px-4 pb-3 pt-1 text-base font-bold transition ${tab === k ? 'text-paper' : 'text-paper-mute hover:text-paper-dim'}`}
            >
              {label}
              {tab === k && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-paper" />}
            </button>
          ))}
        </nav>
      </header>

      <div className="px-4 pt-4 sm:px-6">
        <RangePills value={range} onChange={(v) => set({ range: v })} />
        <div className="mt-4">
          {tab === 'overview' && <OverviewTab range={range} />}
          {tab === 'content' && <ContentTab range={range} />}
          {tab === 'viewers' && <ViewersTab range={range} />}
          {tab === 'followers' && <FollowersTab range={range} />}
        </div>
      </div>
    </div>
  );
}

// ── Tổng quan ───────────────────────────────────────────────────────────────

const OVERVIEW_METRICS = [
  ['videoViews', 'Lượt xem video'],
  ['profileViews', 'Lượt xem hồ sơ'],
  ['likes', 'Thích'],
  ['comments', 'Bình luận'],
  ['shares', 'Lượt chia sẻ'],
];

function OverviewTab({ range }) {
  const [metric, setMetric] = useState('videoViews');
  const { data } = useLoad(() => getMyAnalyticsTab('overview', range), [range]);
  const label = OVERVIEW_METRICS.find(([k]) => k === metric)[1];

  return (
    <div className="space-y-4">
      <Panel title="Số liệu chính" subtitle={periodText(data?.period)}>
        <MetricCards
          cols="grid-cols-2 lg:grid-cols-5"
          items={OVERVIEW_METRICS.map(([key, l]) => ({ key, label: l, metric: data?.summary[key] }))}
          selected={metric}
          onSelect={setMetric}
        />
        <div className="mt-5">
          {data ? <LineChart data={data.series} series={[{ key: metric, label }]} height={220} /> : sk(220)}
        </div>
      </Panel>

      <Panel title="Nguồn lưu lượng truy cập" subtitle="Người xem tìm thấy video của bạn ở đâu">
        {!data ? sk(160) : !data.sources.enough ? (
          <p className="text-sm text-paper-dim">Bạn sẽ có thể xem thông tin này khi có ít nhất {data.sources.min} lượt xem trong khoảng thời gian đã chọn (hiện có {data.summary.videoViews.value}).</p>
        ) : (
          <BarList items={data.sources.items.map((x) => ({ label: SOURCE_LABEL[x.source] || x.source, value: x.views, sub: fmtPct(x.pct) }))} />
        )}
      </Panel>
    </div>
  );
}

// ── Nội dung ────────────────────────────────────────────────────────────────

const SORTS = [
  ['views', 'Lượt xem'],
  ['newest', 'Mới nhất'],
  ['likes', 'Thích'],
  ['comments', 'Bình luận'],
  ['shares', 'Chia sẻ'],
  ['completion', 'Tỷ lệ xem hết'],
];

function ContentTab({ range }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState('views');
  const [picked, setPicked] = useState([]);
  const { data } = useLoad(() => getMyAnalyticsTab('content', range), [range]);

  const videos = useMemo(() => {
    if (!data) return [];
    const key = {
      views: (v) => v.period.views,
      newest: (v) => new Date(v.createdAt).getTime(),
      likes: (v) => v.period.likes,
      comments: (v) => v.period.comments,
      shares: (v) => v.period.shares,
      completion: (v) => v.period.completionRate ?? -1,
    }[sort];
    return [...data.videos].sort((a, b) => key(b) - key(a));
  }, [data, sort]);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? (toast('Chọn tối đa 3 video để so sánh'), p) : [...p, id]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-paper-dim">{data ? `${data.videos.length} bài đăng · số liệu ${periodText(data.period)}` : ' '}</p>
        <div className="flex items-center gap-2">
          <label className="text-sm text-paper-dim" htmlFor="sort">Sắp xếp</label>
          <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-full border border-ink-500 bg-ink-800 px-3 py-1.5 text-sm font-semibold outline-none focus:border-lime">
            {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>

      {picked.length > 0 && (
        <div className="sticky top-[118px] z-10 flex items-center justify-between gap-3 rounded-2xl border border-lime/40 bg-ink-800/95 px-4 py-3 backdrop-blur">
          <span className="text-sm">Đã chọn <b className="font-mono">{picked.length}</b>/3 video để so sánh</span>
          <span className="flex gap-2">
            <button onClick={() => setPicked([])} className="btn-ghost !px-3 !py-1.5 text-sm">Bỏ chọn</button>
            <button disabled={picked.length < 2} onClick={() => navigate(`/analytics/compare?ids=${picked.join(',')}`)} className="btn !px-4 !py-1.5 text-sm">
              <GitCompare size={15} /> So sánh
            </button>
          </span>
        </div>
      )}

      {!data ? sk(320) : !videos.length ? (
        <div className="card py-12 text-center">
          <p className="text-paper-dim">Bạn chưa đăng video nào.</p>
          <Link to="/upload" className="btn mt-4">Đăng video đầu tiên</Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {videos.map((v) => {
            const on = picked.includes(v._id);
            return (
              <li key={v._id} className={`card flex items-center gap-3 p-3 transition ${on ? '!border-lime' : 'hover:border-ink-500'}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(v._id)}
                  className="h-4 w-4 shrink-0 cursor-pointer"
                  style={{ accentColor: '#d9ff3f' }}
                  aria-label={`Chọn "${v.title}" để so sánh`}
                />
                <button onClick={() => navigate(`/analytics/video/${v._id}?range=${range}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="relative h-20 w-[60px] shrink-0 overflow-hidden rounded-xl bg-ink-600">
                    {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                    <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 font-mono text-[10px] font-bold text-white text-shadow"><Play size={9} fill="currentColor" />{formatCount(v.totals.views)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-semibold">{v.title}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-paper-mute">
                      {v.isPrivate && <Lock size={11} aria-label="Riêng tư" />}{timeAgo(v.createdAt)}{v.durationSec ? ` · ${fmtSeconds(v.durationSec)}` : ''}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-paper-dim">
                      <span><b className="text-paper">{fmtNumber(v.period.views)}</b> xem</span>
                      <span><b className="text-paper">{fmtNumber(v.period.likes)}</b> thích</span>
                      <span><b className="text-paper">{fmtNumber(v.period.comments)}</b> bình luận</span>
                      <span><b className="text-paper">{fmtNumber(v.period.shares)}</b> chia sẻ</span>
                      {v.period.completionRate !== null && <span>xem hết <b className="text-paper">{fmtPct(v.period.completionRate)}</b></span>}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-paper-mute" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-paper-mute">Tích chọn 2–3 video để so sánh. Số liệu trong danh sách tính theo khoảng thời gian đã chọn; số trên ảnh bìa là tổng lượt xem.</p>
    </div>
  );
}

// ── Giờ hoạt động (dùng cho Người xem & Followers) ──────────────────────────

const hourLabel = (h) => `${h}:00`;

function ActivityPanel({ activity, range, who, period }) {
  const [mode, setMode] = useState('hours');
  const days = useMemo(() => Object.keys(activity?.byDay || {}), [activity]);
  // Mặc định ngày gần nhất có dữ liệu
  const [dayIdx, setDayIdx] = useState(null);
  useEffect(() => {
    if (!days.length) return;
    let i = days.length - 1;
    while (i > 0 && !activity.byDay[days[i]].some(Boolean)) i -= 1;
    setDayIdx(i);
  }, [days, activity]);

  if (!activity) return <Panel title="Thời gian hoạt động nhiều nhất">{sk(220)}</Panel>;

  const day = days[dayIdx ?? days.length - 1];
  const toggle = (
    <div className="flex gap-2">
      {[['hours', 'Giờ'], ['days', 'Ngày']].map(([k, l]) => (
        <button key={k} onClick={() => setMode(k)} className={`rounded-xl px-4 py-1.5 text-sm font-bold transition ${mode === k ? 'bg-lime/15 text-lime' : 'bg-ink-700 text-paper-dim hover:text-paper'}`}>{l}</button>
      ))}
    </div>
  );

  return (
    <Panel title="Thời gian hoạt động nhiều nhất">
      {toggle}
      {!activity.enough ? (
        <p className="mt-4 text-sm text-paper-dim">Thông tin sẽ được hiển thị khi có đủ dữ liệu.</p>
      ) : (
        <>
          <p className="mt-4 text-sm leading-relaxed">
            Trong {range} ngày vừa qua, {who} hoạt động tích cực nhất vào <b>{WEEKDAY_FULL[activity.peak.weekday]}</b>, từ <b>{hourLabel(activity.peak.hour)}</b> đến <b>{hourLabel((activity.peak.hour + 1) % 24)}</b>.
          </p>
          {mode === 'hours' ? (
            <>
              <div className="mt-4 flex items-center justify-center gap-6">
                <button onClick={() => setDayIdx((i) => Math.max(0, (i ?? days.length - 1) - 1))} disabled={!dayIdx} className="grid h-8 w-8 place-items-center rounded-full hover:bg-ink-700 disabled:opacity-30" aria-label="Ngày trước"><ChevronLeft size={20} /></button>
                <span className="min-w-[110px] text-center font-semibold text-paper-dim">{day && viDate(day)}</span>
                <button onClick={() => setDayIdx((i) => Math.min(days.length - 1, (i ?? days.length - 1) + 1))} disabled={dayIdx === null || dayIdx >= days.length - 1} className="grid h-8 w-8 place-items-center rounded-full hover:bg-ink-700 disabled:opacity-30" aria-label="Ngày sau"><ChevronRight size={20} /></button>
              </div>
              <div className="mt-2">
                <BarChart
                  data={(activity.byDay[day] || Array(24).fill(0)).map((n, h) => ({ value: n, label: h % 4 === 0 ? `${h}h` : '', tip: `${hourLabel(h)} – ${hourLabel((h + 1) % 24)}` }))}
                  unit=" lượt xem"
                />
              </div>
            </>
          ) : (
            <div className="mt-4">
              <BarChart data={activity.weekday.map((n, i) => ({ value: n, label: WEEKDAY_SHORT[i], tip: WEEKDAY_FULL[i] }))} showValues unit=" lượt xem" />
              <p className="mt-2 text-xs text-paper-mute">Tổng lượt xem theo thứ trong {periodText(period)}</p>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

// ── Người xem ───────────────────────────────────────────────────────────────

function ViewersTab({ range }) {
  const [metric, setMetric] = useState('totalViewers');
  const { data } = useLoad(() => getMyAnalyticsTab('viewers', range), [range]);
  const labels = { totalViewers: 'Tổng số người xem', newViewers: 'Người xem mới' };
  const aw = data?.alsoWatched;

  return (
    <div className="space-y-4">
      <Panel title="Số liệu chính" subtitle={periodText(data?.period)}>
        <MetricCards
          items={Object.entries(labels).map(([key, label]) => ({ key, label, metric: data?.summary[key] }))}
          selected={metric}
          onSelect={setMetric}
        />
        <div className="mt-5">{data ? <LineChart data={data.series} series={[{ key: metric, label: labels[metric] }]} height={200} /> : sk(200)}</div>
        {data && (
          <p className="mt-3 text-xs text-paper-mute">
            Tính trên người xem đã đăng nhập{data.guestViews ? `; ngoài ra có ${fmtNumber(data.guestViews)} lượt xem từ khách` : ''}. Người xem mới là người lần đầu xem video của bạn trong khoảng này.
          </p>
        )}
      </Panel>

      <ActivityPanel activity={data?.activity} range={range} who="người xem của bạn" period={data?.period} />

      <Panel title="Nhà sáng tạo mà người xem của bạn cũng đã xem">
        {!data ? sk(120) : !aw.enough ? (
          <p className="text-sm text-paper-dim">Dữ liệu chỉ hiển thị nếu có ít nhất {aw.min} người xem (đã đăng nhập) trong khoảng thời gian đã chọn — hiện có {aw.viewers}.</p>
        ) : !aw.creators.length ? (
          <p className="text-sm text-paper-dim">Người xem của bạn chưa xem nhà sáng tạo nào khác trong khoảng này.</p>
        ) : (
          <div className="no-scrollbar -mx-5 flex gap-4 overflow-x-auto px-5">
            {aw.creators.map((u) => (
              <Link key={u._id} to={`/profile/${u.username}`} className="flex w-28 shrink-0 flex-col items-center text-center">
                <Avatar user={u} size={76} />
                <span className="mt-2 line-clamp-1 w-full font-bold">{u.displayName || u.username}</span>
                <span className="text-xs text-paper-mute">{formatCount(u.followerCount || 0)} follower</span>
                <span className="mt-0.5 font-mono text-[10px] text-paper-mute">{u.sharedViewers} người xem chung</span>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Bài đăng mà người xem của bạn cũng đã xem">
        {!data ? sk(160) : !aw.enough || !aw.videos.length ? (
          <p className="text-sm text-paper-dim">Bạn sẽ có thể xem thông tin này sau khi có đủ dữ liệu để phân tích.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {aw.videos.map((v) => (
              <Link key={v._id} to={`/watch/${v._id}`} className="group relative aspect-[3/4] overflow-hidden rounded-xl bg-ink-700">
                {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-105" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <span className="line-clamp-2 text-xs font-semibold text-white">{v.title}</span>
                  <span className="font-mono text-[10px] text-white/70">@{v.userId?.username} · {formatCount(v.viewCount)} xem</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ── Followers ───────────────────────────────────────────────────────────────

function FollowersTab({ range }) {
  const [metric, setMetric] = useState('totalFollowers');
  const { data } = useLoad(() => getMyAnalyticsTab('followers', range), [range]);

  return (
    <div className="space-y-4">
      <Panel title="Số liệu chính" subtitle={periodText(data?.period)}>
        <MetricCards
          items={[
            { key: 'totalFollowers', label: 'Tổng số follower', metric: data?.summary.totalFollowers, hint: data && 'Từ trước tới nay' },
            { key: 'netFollowers', label: 'Số follower ròng', metric: data?.summary.netFollowers },
          ]}
          selected={metric}
          onSelect={setMetric}
        />
        <div className="mt-5">
          {!data ? sk(220) : metric === 'totalFollowers' ? (
            <LineChart data={data.series} series={[{ key: 'totalFollowers', label: 'Tổng số follower' }]} height={220} />
          ) : (
            <>
              <LineChart data={data.series} series={[{ key: 'gained', label: 'Follow mới' }, { key: 'lost', label: 'Unfollow' }]} height={220} area={false} />
              <p className="mt-2 text-xs text-paper-mute">+{fmtNumber(data.gained)} follow mới · −{fmtNumber(data.lost)} unfollow trong {periodText(data.period)}</p>
            </>
          )}
        </div>
      </Panel>

      <ActivityPanel activity={data?.activity} range={range} who="follower của bạn" period={data?.period} />

      {data && data.summary.totalFollowers.value === 0 && (
        <EmptyNote>Bạn chưa có follower nào. Đăng video đều đặn và dùng hashtag phù hợp để có follower đầu tiên.</EmptyNote>
      )}
    </div>
  );
}
