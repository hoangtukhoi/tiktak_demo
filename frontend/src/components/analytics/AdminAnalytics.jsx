import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Clock, ShieldAlert, UserX } from 'lucide-react';
import Avatar from '../common/Avatar';
import { getAdminAnalytics } from '../../api/analytics.api';
import { errMsg } from '../../api/axiosClient';
import { formatCount } from '../../utils/format';
import {
  BarList, COLORS, DataTable, EmptyNote, LineChart, Panel, RangeTabs, StatTile, fmtNumber, fmtPct, fmtSeconds, shortDate,
} from './Charts';

const RANGES = [[7, '7 ngày'], [30, '30 ngày'], [90, '90 ngày']];
const REASON_LABEL = { spam: 'Spam', violence: 'Bạo lực', sexual: 'Nội dung nhạy cảm', other: 'Khác' };
const SOURCE_LABEL = { for_you: 'Dành cho bạn', following: 'Đang theo dõi', profile: 'Trang cá nhân', search: 'Tìm kiếm', direct: 'Link trực tiếp', other: 'Khác' };
const STATUS_LABEL = { ready: 'Sẵn sàng', processing: 'Đang xử lý', uploading: 'Đang tải lên', failed: 'Lỗi', deleted: 'Đã xoá' };
const ACTION_LABEL = { ban_user: 'Khoá tài khoản', unban_user: 'Mở khoá', verify_user: 'Xác minh', remove_video: 'Gỡ video', approve_video: 'Duyệt video', flag_video: 'Gắn cờ' };

const GROWTH = [
  ['views', 'Lượt xem'],
  ['activeViewers', 'Người xem hoạt động'],
  ['newUsers', 'Người dùng mới'],
  ['newVideos', 'Video mới'],
];

/** Ô số liệu nhỏ có icon trạng thái (không dùng màu đơn thuần để báo trạng thái) */
function StatusStat({ icon, label, value, tone = 'neutral' }) {
  const Icon = tone === 'good' ? CheckCircle2 : icon; // trạng thái tốt luôn dùng dấu tích
  const color = { good: 'rgb(var(--success))', warn: 'rgb(var(--warn))', bad: 'rgb(var(--danger))', neutral: COLORS.textDim }[tone];
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2/60 px-4 py-3">
      <Icon size={20} style={{ color }} aria-hidden />
      <div>
        <p className="tabular text-xl font-bold">{value}</p>
        <p className="text-xs text-fg-muted">{label}</p>
      </div>
    </div>
  );
}

export default function AdminAnalytics() {
  const [range, setRange] = useState(30);
  const [metric, setMetric] = useState('views');
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    getAdminAnalytics(range).then((d) => alive && setData(d)).catch((e) => toast.error(errMsg(e)));
    return () => { alive = false; };
  }, [range]);

  const s = data?.summary;
  const m = data?.moderation;
  const p = data?.pipeline;
  const metricLabel = GROWTH.find(([k]) => k === metric)?.[1];
  const sk = (h) => <div className="skeleton rounded-2xl" style={{ height: h }} />;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          {data ? <>Tổng: <b className="tabular text-fg">{fmtNumber(data.totals.users)}</b> người dùng · <b className="tabular text-fg">{fmtNumber(data.totals.videos)}</b> video · <b className="tabular text-fg">{fmtNumber(data.totals.views)}</b> lượt xem tích luỹ</> : ' '}
        </p>
        <RangeTabs value={range} onChange={setRange} options={RANGES} />
      </div>

      {/* ── 1. Tăng trưởng ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Người dùng mới" metric={s?.newUsers} />
        <StatTile label={'Người\u00a0dùng hoạt\u00a0động'} metric={s?.activeUsers} hint="đăng nhập hoặc xem video" />
        <StatTile label="Video mới" metric={s?.newVideos} />
        <StatTile label="Lượt xem" metric={s?.views} />
        <StatTile label="Tương tác" metric={s ? { ...s.likes, value: s.likes.value + s.comments.value } : null} hint={s ? `${fmtNumber(s.likes.value)} thích · ${fmtNumber(s.comments.value)} bình luận` : null} />
        <StatTile
          label="Tỷ lệ tương tác"
          metric={s?.engagementRate}
          format={fmtPct}
          hint={s && s.engagementRate.value === null ? 'Cần ít nhất 30 lượt xem trong kỳ' : '(thích + bình luận) / lượt xem'}
        />
      </div>

      <Panel
        className="mt-6"
        title={`${metricLabel} theo ngày`}
        subtitle={data ? `${shortDate(data.series[0].date)} – ${shortDate(data.series.at(-1).date)}` : ' '}
        action={
          <div className="flex flex-wrap gap-1.5">
            {GROWTH.map(([k, label]) => (
              <button key={k} onClick={() => setMetric(k)} className={`rounded-full px-3 py-1 text-xs font-bold transition ${metric === k ? 'bg-fg text-bg' : 'bg-surface-2 text-fg-muted hover:text-fg'}`}>{label}</button>
            ))}
          </div>
        }
        table={data && (
          <DataTable
            columns={[
              { key: 'date', label: 'Ngày', format: shortDate },
              ...GROWTH.map(([k, l]) => ({ key: k, label: l, align: 'right', format: fmtNumber })),
              { key: 'likes', label: 'Thích', align: 'right', format: fmtNumber },
              { key: 'comments', label: 'Bình luận', align: 'right', format: fmtNumber },
            ]}
            rows={[...data.series].reverse()}
          />
        )}
      >
        {data ? <LineChart data={data.series} series={[{ key: metric, label: metricLabel }]} /> : sk(240)}
      </Panel>

      {/* ── 2. Nội dung & tương tác ── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Thích & bình luận mỗi ngày">
          {data ? <LineChart data={data.series} series={[{ key: 'likes', label: 'Lượt thích' }, { key: 'comments', label: 'Bình luận' }]} height={220} area={false} /> : sk(220)}
        </Panel>
        <Panel title="Chất lượng lượt xem" subtitle="Tính trên lượt xem có ghi thời gian xem">
          {data ? (
            data.watch.views ? (
              <div className="grid grid-cols-2 gap-3">
                <StatusStat icon={Clock} label="Thời gian xem TB" value={fmtSeconds(data.watch.avgWatchSec)} />
                <StatusStat icon={CheckCircle2} label="Tỷ lệ xem hết" value={fmtPct(data.watch.completionRate)} />
                <StatusStat icon={Clock} label="Tổng thời gian xem" value={fmtSeconds(data.watch.totalWatchSec ?? data.watch.totalWatchHours * 3600)} />
                <StatusStat icon={CheckCircle2} label="Xem trung bình" value={fmtPct(data.watch.avgWatchedPct)} />
                <div className="col-span-2 mt-2">
                  <p className="label mb-3">Nguồn lượt xem</p>
                  <BarList items={data.sources.map((x) => ({ label: SOURCE_LABEL[x.source] || x.source, value: x.views, sub: fmtPct(x.pct) }))} />
                </div>
              </div>
            ) : <EmptyNote>Chưa có lượt xem nào trong kỳ. Thời gian xem và nguồn lượt xem được ghi từ khi bật tính năng phân tích.</EmptyNote>
          ) : sk(220)}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr_1fr]">
        <Panel title="Top video" subtitle={data?.topVideos.basis === 'all_time' ? 'Theo tổng lượt xem (kỳ này chưa có lượt xem)' : 'Theo lượt xem trong kỳ'}>
          {data ? (
            <ol className="space-y-2.5">
              {data.topVideos.items.map((v, i) => (
                <li key={v._id}>
                  <Link to={`/admin/videos/${v._id}/analytics`} title="Xem phân tích video" className="flex items-center gap-3 rounded-xl p-1 transition hover:bg-surface-2">
                    <span className="w-5 shrink-0 text-right tabular text-xs text-fg-subtle">{i + 1}</span>
                    {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" className="h-11 w-8 shrink-0 rounded-md object-cover" /> : <span className="h-11 w-8 shrink-0 rounded-md bg-surface-3" />}
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-sm font-semibold">{v.title}</span>
                      <span className="text-xs text-fg-subtle">@{v.author?.username}{v.completionRate !== null && ` · xem hết ${fmtPct(v.completionRate)}`}</span>
                    </span>
                    <span className="shrink-0 tabular text-sm font-bold">{fmtNumber(v.views)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : sk(300)}
        </Panel>
        <Panel title="Top creator" subtitle={data?.topCreators.basis === 'all_time' ? 'Theo số người theo dõi' : 'Theo lượt xem trong kỳ'}>
          {data ? (
            <ol className="space-y-2.5">
              {data.topCreators.items.map((u, i) => (
                <li key={u._id}>
                  <Link to={`/profile/${u.username}`} className="flex items-center gap-3 rounded-xl p-1 transition hover:bg-surface-2">
                    <span className="w-5 shrink-0 text-right tabular text-xs text-fg-subtle">{i + 1}</span>
                    <Avatar user={u} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-sm font-semibold">{u.displayName || u.username}</span>
                      <span className="text-xs text-fg-subtle">{fmtNumber(u.followerCount)} follower{u.newFollowers ? ` · ${u.newFollowers > 0 ? '+' : ''}${u.newFollowers} kỳ này` : ''}</span>
                    </span>
                    {data.topCreators.basis === 'period' && <span className="shrink-0 tabular text-sm font-bold">{fmtNumber(u.views)}</span>}
                  </Link>
                </li>
              ))}
            </ol>
          ) : sk(300)}
        </Panel>
        <Panel title="Hashtag nổi bật" subtitle="Trong các video đăng trong kỳ">
          {data ? (
            <BarList items={data.hashtags.map((h) => ({ label: `#${h.tag}`, value: h.videos, sub: `${formatCount(h.views)} xem` }))} format={(n) => `${n} video`} empty="Chưa có video mới gắn hashtag" />
          ) : sk(300)}
        </Panel>
      </div>

      {/* ── 3. Kiểm duyệt ── */}
      <h2 className="mb-4 mt-10 text-2xl font-extrabold">Kiểm duyệt</h2>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Tình trạng">
          {m ? (
            <div className="grid grid-cols-2 gap-3">
              <StatusStat icon={AlertTriangle} label="Video đang bị gắn cờ" value={fmtNumber(m.pendingFlagged)} tone={m.pendingFlagged ? 'warn' : 'good'} />
              <StatusStat icon={ShieldAlert} label={`Báo cáo trong ${range} ngày`} value={fmtNumber(m.reportsTotal)} tone={m.reportsTotal ? 'warn' : 'neutral'} />
              <StatusStat icon={Clock} label="Thời gian xử lý TB" value={m.avgResolveHours === null ? '—' : `${m.avgResolveHours} giờ`} />
              <StatusStat icon={UserX} label="Tài khoản đang bị khoá" value={fmtNumber(m.bannedUsers)} tone={m.bannedUsers ? 'bad' : 'neutral'} />
              <div className="col-span-2 mt-1 flex flex-wrap gap-1.5">
                {Object.entries(m.actions).map(([k, n]) => (
                  <span key={k} className="rounded-full bg-surface-2 px-3 py-1 text-xs text-fg-muted">{ACTION_LABEL[k] || k}: <b className="tabular text-fg">{n}</b></span>
                ))}
                {!Object.keys(m.actions).length && <span className="text-xs text-fg-subtle">Chưa có thao tác quản trị nào trong kỳ</span>}
              </div>
            </div>
          ) : sk(220)}
        </Panel>
        <Panel title="Báo cáo vi phạm">
          {data ? (
            <div className="grid gap-6 sm:grid-cols-2">
              <BarList items={m.reportsByReason.map((r) => ({ label: REASON_LABEL[r.reason] || r.reason, value: r.count }))} empty="Không có báo cáo trong kỳ" />
              <LineChart data={data.series} series={[{ key: 'reports', label: 'Báo cáo' }]} height={160} />
            </div>
          ) : sk(220)}
        </Panel>
      </div>

      {/* ── 4. Pipeline video ── */}
      <h2 className="mb-4 mt-10 text-2xl font-extrabold">Xử lý video</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Upload & xử lý" subtitle={`Video tải lên trong ${range} ngày`}>
          {p ? (
            <div className="grid grid-cols-2 gap-3">
              <StatusStat icon={CheckCircle2} label="Video tải lên" value={fmtNumber(p.uploads)} />
              <StatusStat icon={CheckCircle2} label="Tỷ lệ thành công" value={fmtPct(p.successRate)} tone={p.successRate === null ? 'neutral' : p.successRate >= 95 ? 'good' : p.successRate >= 80 ? 'warn' : 'bad'} />
              <StatusStat icon={Clock} label="Thời gian xử lý (trung vị)" value={fmtSeconds(p.medianProcessingSec)} />
              <StatusStat icon={AlertTriangle} label="Video lỗi" value={fmtNumber(p.statusPeriod.failed || 0)} tone={p.statusPeriod.failed ? 'bad' : 'good'} />
            </div>
          ) : sk(160)}
        </Panel>
        <Panel title="Hàng đợi & trạng thái" subtitle="Hàng đợi nén video (BullMQ) · toàn bộ video theo trạng thái">
          {p ? (
            <div className="grid gap-6 sm:grid-cols-2">
              {p.queue ? (
                <BarList items={[['waiting', 'Đang chờ'], ['active', 'Đang chạy'], ['delayed', 'Chờ thử lại'], ['failed', 'Thất bại']].map(([k, l]) => ({ label: l, value: p.queue[k] || 0 }))} empty="Hàng đợi trống" />
              ) : <EmptyNote>Không đọc được hàng đợi (Redis?)</EmptyNote>}
              <BarList items={Object.entries(p.statusAll).map(([k, n]) => ({ label: STATUS_LABEL[k] || k, value: n }))} color={COLORS.series[0]} />
            </div>
          ) : sk(160)}
        </Panel>
      </div>

      {data && <p className="mt-6 text-right tabular text-[11px] text-fg-subtle">Cập nhật {new Date(data.generatedAt).toLocaleTimeString('vi-VN')} · làm mới mỗi 5 phút · múi giờ {data.timezone}</p>}
    </div>
  );
}
