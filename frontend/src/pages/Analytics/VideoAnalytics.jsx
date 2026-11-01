import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowDownRight, ArrowLeft, ArrowUpRight, CheckCircle2, ExternalLink, Info, Lock, ShieldAlert } from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import { getAdminVideoAnalytics, getMyVideoAnalytics } from '../../api/analytics.api';
import * as adminApi from '../../api/admin.api';
import { errMsg } from '../../api/axiosClient';
import { formatCount, timeAgo } from '../../utils/format';
import {
  BarChart, BarList, Heatmap, LineChart, MetricCards, Panel, fmtNumber, fmtPct, fmtSeconds, shortDate,
} from '../../components/analytics/Charts';
import { RangePills, SOURCE_LABEL, periodText, useLoad } from './shared';

const CREATOR_RANGES = [[7, '7 ngày'], [28, '28 ngày'], [60, '60 ngày'], [365, '365 ngày']];
const ADMIN_RANGES = [[7, '7 ngày'], [30, '30 ngày'], [90, '90 ngày'], [365, '365 ngày']];
const REASON_LABEL = { spam: 'Spam', violence: 'Bạo lực', sexual: 'Nội dung nhạy cảm', other: 'Khác' };
const MOD_LABEL = { approved: 'Đã duyệt', pending: 'Chờ duyệt', flagged: 'Bị gắn cờ', removed: 'Đã gỡ' };

const SERIES_METRICS = [
  ['views', 'Lượt xem'],
  ['uniqueViewers', 'Người xem'],
  ['likes', 'Thích'],
  ['comments', 'Bình luận'],
  ['shares', 'Chia sẻ'],
];

const INSIGHT_STYLE = {
  good: { Icon: CheckCircle2, color: '#6fd36f', label: 'Tốt' },
  warn: { Icon: AlertTriangle, color: '#fab219', label: 'Cần cải thiện' },
  info: { Icon: Info, color: '#a39c8f', label: 'Thông tin' },
};

/** So sánh với trung bình kênh: mũi tên + chữ (không chỉ dựa vào màu) */
function VsChannel({ value, base, format, lowerIsBetter = false, enough }) {
  if (!enough || value === null || value === undefined || base === null || base === undefined) {
    return <span className="text-paper-mute">Chưa đủ dữ liệu kênh để so sánh</span>;
  }
  const diff = Math.round((value - base) * 10) / 10;
  if (Math.abs(diff) < 0.05) return <span className="text-paper-mute">Bằng TB kênh ({format(base)})</span>;
  const higher = diff > 0;
  const good = lowerIsBetter ? !higher : higher;
  const Icon = higher ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1" style={{ color: good ? '#6fd36f' : '#ef8a8a' }}>
      <Icon size={13} aria-hidden />
      {higher ? 'Cao hơn' : 'Thấp hơn'} TB kênh ({format(base)})
    </span>
  );
}

function QualityTile({ label, value, format, base, lowerIsBetter, enough, hint }) {
  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-800 p-4">
      <p className="text-sm font-semibold text-paper-dim">{label}</p>
      <p className="mt-2 font-mono text-2xl font-bold tracking-tighter">{format(value)}</p>
      <p className="mt-1.5 text-xs">{base !== undefined ? <VsChannel value={value} base={base} format={format} lowerIsBetter={lowerIsBetter} enough={enough} /> : <span className="text-paper-mute">{hint}</span>}</p>
    </div>
  );
}

export default function VideoAnalytics({ mode = 'creator' }) {
  const isAdmin = mode === 'admin';
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const ranges = isAdmin ? ADMIN_RANGES : CREATOR_RANGES;
  const range = ranges.some(([v]) => v === Number(params.get('range'))) ? Number(params.get('range')) : isAdmin ? 30 : 7;
  const [metric, setMetric] = useState('views');
  const [busy, setBusy] = useState(false);
  const { data, error } = useLoad(() => (isAdmin ? getAdminVideoAnalytics(id, range) : getMyVideoAnalytics(id, range)), [id, range, isAdmin]);

  const backTo = isAdmin ? '/admin' : '/analytics?tab=content';
  const back = (
    <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm font-semibold text-paper-dim hover:text-paper">
      <ArrowLeft size={16} /> {isAdmin ? 'Quản trị' : 'Nội dung'}
    </Link>
  );

  if (error?.response?.status === 404) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 pt-6 sm:px-6">
        {back}
        <p className="mt-12 text-center text-paper-dim">Không tìm thấy video{isAdmin ? '' : ', hoặc video không thuộc kênh của bạn'}.</p>
      </div>
    );
  }

  const v = data?.video;
  const w = data?.watch;
  const a = data?.audience;
  const b = data?.baseline;
  const metricLabel = SERIES_METRICS.find(([k]) => k === metric)[1];
  const sums = data ? Object.fromEntries(SERIES_METRICS.map(([k]) => [k, data.series.reduce((s, d) => s + (d[k] || 0), 0)])) : null;

  const moderate = async (kind) => {
    if (kind === 'remove' && !confirm(`Gỡ video “${v.title}”?`)) return;
    setBusy(true);
    try {
      await (kind === 'remove' ? adminApi.removeVideo(v._id) : adminApi.approveVideo(v._id));
      toast(kind === 'remove' ? 'Đã gỡ video' : 'Đã duyệt video');
      navigate(0); // tải lại số liệu (trạng thái kiểm duyệt mới)
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-16 pt-5 sm:px-6">
      {back}

      {/* ── Đầu trang: video ── */}
      <div className="mt-4 flex gap-4">
        {v?.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" className="h-32 w-24 shrink-0 rounded-2xl object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : <span className="skeleton h-32 w-24 shrink-0 rounded-2xl" />}
        <div className="min-w-0 flex-1">
          <p className="label">Phân tích video</p>
          <h1 className="mt-1 line-clamp-3 text-2xl font-extrabold sm:text-3xl">{v ? v.title : '…'}</h1>
          {v && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-paper-dim">
              {v.isPrivate && <span className="inline-flex items-center gap-1"><Lock size={13} /> Riêng tư ·</span>}
              Đăng {timeAgo(v.createdAt)} · dài {fmtSeconds(v.durationSec)} · {formatCount(v.totalViews)} lượt xem tích luỹ
            </p>
          )}
          {v && (
            <Link to={`/watch/${v._id}`} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-lime hover:underline">
              Xem video <ExternalLink size={13} />
            </Link>
          )}
        </div>
      </div>

      <div className="mt-5">
        <RangePills value={range} onChange={(r) => setParams({ range: String(r) }, { replace: true })} options={ranges} />
      </div>

      {/* ── Admin: tác giả + kiểm duyệt ── */}
      {isAdmin && data && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel title="Tác giả">
            <Link to={`/profile/${data.author.username}`} className="flex items-center gap-3 hover:text-lime">
              <Avatar user={data.author} size={48} />
              <span>
                <span className="block font-bold">{data.author.displayName || data.author.username}</span>
                <span className="text-sm text-paper-dim">@{data.author.username} · {formatCount(data.author.followerCount || 0)} follower</span>
                {data.author.bannedAt && <span className="mt-1 block text-xs font-bold text-coral">Tài khoản đang bị khoá</span>}
              </span>
            </Link>
          </Panel>
          <Panel
            title="Kiểm duyệt"
            subtitle={`Trạng thái: ${MOD_LABEL[data.moderation.status] || data.moderation.status} · ${data.moderation.reportCount} báo cáo${data.moderation.lastReportAt ? ` · gần nhất ${timeAgo(data.moderation.lastReportAt)}` : ''}`}
            action={
              <div className="flex gap-2">
                {data.moderation.status !== 'approved' && <button disabled={busy} onClick={() => moderate('approve')} className="btn-ghost !px-3 !py-1.5 text-sm">Duyệt</button>}
                {data.moderation.status !== 'removed' && <button disabled={busy} onClick={() => moderate('remove')} className="btn-ghost !px-3 !py-1.5 text-sm !text-coral">Gỡ video</button>}
              </div>
            }
          >
            {data.moderation.flagReason && <p className="mb-3 flex items-center gap-1.5 text-sm text-paper-dim"><ShieldAlert size={15} /> {data.moderation.flagReason}</p>}
            <BarList items={data.moderation.reportsByReason.map((r) => ({ label: REASON_LABEL[r.reason], value: r.count }))} empty="Video chưa bị báo cáo" />
          </Panel>
        </div>
      )}

      {/* ── Nhận xét tự động ── */}
      <Panel className="mt-4" title="Nhận xét" subtitle="Tự động rút ra từ số liệu của video trong khoảng đã chọn">
        {!data ? <div className="skeleton h-20 rounded-2xl" /> : (
          <ul className="space-y-2.5">
            {data.insights.map((it, i) => {
              const st = INSIGHT_STYLE[it.type] || INSIGHT_STYLE.info;
              return (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                  <st.Icon size={18} style={{ color: st.color }} className="mt-0.5 shrink-0" aria-label={st.label} />
                  <span>{it.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* ── Số liệu chính ── */}
      <Panel className="mt-4" title="Số liệu chính" subtitle={data ? periodText({ from: data.series[0].date, to: data.series.at(-1).date }) : ' '}>
        <MetricCards
          cols="grid-cols-2 lg:grid-cols-5"
          items={SERIES_METRICS.map(([key, label]) => ({
            key,
            label,
            metric: sums && { value: key === 'uniqueViewers' ? a.uniqueViewers : sums[key] },
            hint: key === 'uniqueViewers' && a ? `${fmtNumber(a.guestViews)} lượt xem từ khách` : sums ? 'trong khoảng đã chọn' : undefined,
          }))}
          selected={metric}
          onSelect={setMetric}
        />
        <div className="mt-5">{data ? <LineChart data={data.series} series={[{ key: metric, label: metricLabel }]} height={220} /> : <div className="skeleton h-[220px] rounded-2xl" />}</div>
      </Panel>

      {/* ── Chất lượng xem, so với trung bình kênh ── */}
      <Panel className="mt-4" title="Chất lượng lượt xem" subtitle={b ? (b.enough ? `So với trung bình ${b.videos} video khác của kênh trong cùng khoảng` : 'Kênh chưa đủ lượt xem ở các video khác để so sánh') : ' '}>
        {!data ? <div className="skeleton h-40 rounded-2xl" /> : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <QualityTile label="Thời gian xem TB" value={w.avgWatchSec} format={fmtSeconds} base={b.avgWatchSec} enough={b.enough} />
            <QualityTile label="Xem trung bình" value={w.avgWatchedPct} format={fmtPct} base={b.avgWatchedPct} enough={b.enough} />
            <QualityTile label="Tỷ lệ xem hết" value={w.completionRate} format={fmtPct} base={b.completionRate} enough={b.enough} />
            <QualityTile label="Rời đi trong 3 giây đầu" value={a.earlyDropRate} format={fmtPct} base={b.earlyDropRate} lowerIsBetter enough={b.enough} />
            <QualityTile label="Tỷ lệ xem lại" value={a.rewatchRate} format={fmtPct} base={b.rewatchRate} enough={b.enough} />
            <QualityTile
              label="Tỷ lệ tương tác"
              value={data.engagement.rate}
              format={fmtPct}
              hint={data.engagement.rate === null ? 'Cần ≥ 30 lượt xem trong kỳ' : '(thích + bình luận + chia sẻ) / lượt xem'}
            />
          </div>
        )}
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Giữ chân người xem" subtitle="% người xem còn ở lại tại mỗi mốc thời lượng">
          {data?.retention.length ? (
            <LineChart
              data={data.retention.map((r) => ({ x: r.at, pct: r.pct }))}
              series={[{ key: 'pct', label: 'Còn xem' }]}
              height={220}
              yMax={100}
              ySuffix="%"
              xFormat={(x) => `${x}%`}
              tooltipTitle={(x) => `Tại ${x}% thời lượng${v?.durationSec ? ` (~${fmtSeconds((v.durationSec * x) / 100)})` : ''}`}
            />
          ) : data ? <p className="py-10 text-center text-sm text-paper-mute">Chưa có dữ liệu giữ chân</p> : <div className="skeleton h-[220px] rounded-2xl" />}
        </Panel>
        <Panel title="7 ngày đầu sau khi đăng" subtitle="Đà tăng lượt xem ban đầu">
          {data ? (
            <BarChart data={data.first7Days.map((d) => ({ label: `N${d.day}`, value: d.views, tip: `Ngày ${d.day} · ${shortDate(d.date)}` }))} height={220} showValues unit=" lượt xem" />
          ) : <div className="skeleton h-[220px] rounded-2xl" />}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Nguồn lưu lượng truy cập">
          {data ? (
            <BarList items={data.sources.map((x) => ({ label: SOURCE_LABEL[x.source] || x.source, value: x.views, sub: fmtPct(x.pct) }))} empty="Chưa có lượt xem trong khoảng này" />
          ) : <div className="skeleton h-40 rounded-2xl" />}
        </Panel>
        <Panel title="Người xem xem video này lúc nào" subtitle="Theo thứ trong tuần và giờ trong ngày">
          {data ? <Heatmap grid={data.heatmap.grid} /> : <div className="skeleton h-40 rounded-2xl" />}
        </Panel>
      </div>

      {v && (
        <p className="mt-5 text-sm text-paper-dim">
          Tổng cộng từ khi đăng: <b className="font-mono text-paper">{fmtNumber(v.likes)}</b> thích · <b className="font-mono text-paper">{fmtNumber(v.comments)}</b> bình luận · <b className="font-mono text-paper">{fmtNumber(v.shares)}</b> chia sẻ
          {v.hashtags?.length > 0 && <> · {v.hashtags.map((t) => `#${t}`).join(' ')}</>}
        </p>
      )}
    </div>
  );
}
