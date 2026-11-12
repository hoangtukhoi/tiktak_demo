import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, BadgeCheck, BarChart3, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import VideoCard from '../../components/video/VideoCard';
import EditVideoDialog from '../../components/video/EditVideoDialog';
import CommentList from '../../components/comment/CommentList';
import Avatar from '../../components/common/Avatar';
import RichText from '../../components/common/RichText';
import Menu from '../../components/common/Menu';
import FollowButton from '../../components/common/FollowButton';
import useAuth from '../../hooks/useAuth';
import { useIsDesktop } from '../../hooks/useMedia';
import { deleteVideo, getVideo } from '../../api/video.api';
import { errMsg } from '../../api/axiosClient';
import { formatCount, timeAgo } from '../../utils/format';
import { VISIBILITY } from '../../utils/constants';

export default function VideoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const wide = useIsDesktop();
  const { user, isAdmin, isStaff } = useAuth();
  const viewSource = useLocation().state?.from || 'direct'; // profile | search | direct
  const [video, setVideo] = useState(null);
  const [error, setError] = useState('');
  const [comments, setComments] = useState(0);
  const [editing, setEditing] = useState(false);
  const mine = video && user?._id === video.author._id;

  useEffect(() => {
    let alive = true;
    setVideo(null); setError('');
    getVideo(id).then((v) => { if (alive) { setVideo(v); setComments(v.commentCount); } })
      .catch((e) => alive && setError(e.response?.status === 404 ? 'Video không tồn tại hoặc đã bị xoá.' : errMsg(e)));
    return () => { alive = false; };
  }, [id]);

  const back = () => (history.length > 1 ? navigate(-1) : navigate('/'));
  const remove = async () => {
    if (!confirm('Xoá video này? Không thể hoàn tác.')) return;
    try { await deleteVideo(video._id); toast('Đã xoá video'); navigate(`/profile/${user.username}`); } catch (e) { toast.error(errMsg(e)); }
  };

  // Chủ video → trang Phân tích của mình; admin → bản phân tích dành cho quản trị
  const analyticsUrl = video && (mine && !isAdmin ? `/analytics/video/${video._id}` : isStaff ? `/admin/videos/${video._id}/analytics` : null);

  if (error) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div><p className="text-lg font-bold">Không xem được video</p><p className="mt-1 text-fg-muted">{error}</p><Link to="/" className="btn-outline mt-5">Về bảng tin</Link></div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="relative min-w-0 flex-1 bg-black lg:bg-surface-2">
        <button onClick={back} className="absolute left-3 top-3 z-30 grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60" aria-label="Quay lại"><ArrowLeft size={20} /></button>
        {analyticsUrl && (
          <Link to={analyticsUrl} className="absolute left-16 top-3 z-30 inline-flex h-10 items-center gap-1.5 rounded-full bg-black/40 px-4 text-sm font-semibold text-white hover:bg-black/60">
            <BarChart3 size={16} /> Phân tích
          </Link>
        )}
        {video ? (
          <VideoCard video={video} active near layout="detail" source={viewSource} key={video._id + (video.updatedAt || '')}
            onCommentsInline={wide ? () => document.querySelector('#comment-panel input')?.focus() : undefined} />
        ) : <div className="flex h-full justify-center lg:py-5"><div className="skeleton h-full w-full lg:aspect-[9/16] lg:w-auto lg:rounded-xl" /></div>}
      </div>

      {wide && (
        <aside id="comment-panel" className="flex w-[420px] shrink-0 flex-col border-l border-line bg-surface">
          {video ? (
            <>
              <div className="border-b border-line p-5">
                <div className="flex items-center gap-3">
                  <Link to={`/profile/${video.author.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar user={video.author} size={44} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1 truncate font-bold">{video.author.username}{video.author.isVerified && <BadgeCheck size={15} className="text-brand-text" />}</span>
                      <span className="text-sm text-fg-muted">{timeAgo(video.createdAt)}</span>
                    </span>
                  </Link>
                  {mine ? (
                    <Menu trigger={({ toggle }) => <button onClick={toggle} className="icon-btn" aria-label="Tuỳ chọn video"><MoreHorizontal size={20} /></button>}
                      items={[{ label: 'Chỉnh sửa', icon: Pencil, onClick: () => setEditing(true) }, { label: 'Phân tích', icon: BarChart3, onClick: () => navigate(analyticsUrl) }, { label: 'Xoá video', icon: Trash2, onClick: remove, danger: true }]} />
                  ) : !isAdmin && <FollowButton user={video.author} size="sm" />}
                </div>
                <h1 className="mt-4 text-md font-bold"><RichText text={video.title} mentions={video.mentions} /></h1>
                {video.description && <p className="mt-1 whitespace-pre-wrap text-base text-fg-muted"><RichText text={video.description} mentions={video.mentions} /></p>}
                {video.hashtags.length > 0 && <p className="mt-1 flex flex-wrap gap-x-2 text-base font-semibold">{video.hashtags.map((t) => <Link key={t} to={`/search?q=%23${t}`} className="hover:underline">#{t}</Link>)}</p>}
                <p className="tabular mt-3 text-sm text-fg-muted">
                  {formatCount(video.viewCount)} lượt xem · {formatCount(video.likeCount)} lượt thích · {formatCount(comments)} bình luận
                  {mine && video.visibility !== 'public' && <> · {VISIBILITY.find(([v]) => v === video.visibility)?.[1]}</>}
                </p>
              </div>
              <div className="min-h-0 flex-1">
                <CommentList videoId={video._id} videoOwnerId={video.author._id} policy={video.commentPolicy} allowComment={video.allowComment !== false} onCountChange={(d) => setComments((c) => c + d)} />
              </div>
            </>
          ) : <div className="space-y-3 p-5"><span className="skeleton block h-11 w-48 rounded" /><span className="skeleton block h-5 w-full rounded" /><span className="skeleton block h-5 w-2/3 rounded" /></div>}
        </aside>
      )}
      {mine && <EditVideoDialog video={video} open={editing} onClose={() => setEditing(false)} onSaved={(v) => setVideo((old) => ({ ...old, ...v, author: old.author, updatedAt: Date.now() }))} />}
    </div>
  );
}
