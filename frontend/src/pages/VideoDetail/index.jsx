import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck } from 'lucide-react';
import VideoCard from '../../components/video/VideoCard';
import CommentList from '../../components/comment/CommentList';
import Avatar from '../../components/common/Avatar';
import { getVideo } from '../../api/video.api';
import { errMsg } from '../../api/axiosClient';
import { formatCount, timeAgo } from '../../utils/format';

const mq = typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)') : null;
const useWide = () => useSyncExternalStore((cb) => { mq.addEventListener('change', cb); return () => mq.removeEventListener('change', cb); }, () => mq.matches);

export default function VideoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const wide = useWide();
  const [video, setVideo] = useState(null);
  const [error, setError] = useState('');
  const [comments, setComments] = useState(0);

  useEffect(() => {
    let alive = true;
    setVideo(null); setError('');
    getVideo(id)
      .then((v) => { if (alive) { setVideo(v); setComments(v.commentCount); } })
      .catch((e) => alive && setError(e.response?.status === 404 ? 'Video không tồn tại hoặc đã bị xoá.' : errMsg(e)));
    return () => { alive = false; };
  }, [id]);

  const back = () => (history.length > 1 ? navigate(-1) : navigate('/'));

  if (error) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-3xl font-extrabold">Không xem được video</p>
          <p className="mt-2 text-paper-dim">{error}</p>
          <Link to="/" className="btn mt-6">Về bảng tin</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="relative min-w-0 flex-1 bg-[radial-gradient(ellipse_at_center,#1c1a17,#0e0d0c_70%)]">
        <button onClick={back} className="absolute left-4 top-4 z-30 grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60" aria-label="Quay lại">
          <ArrowLeft size={20} />
        </button>
        {video ? (
          <VideoCard video={video} active near layout="detail" onCommentsInline={wide ? () => document.getElementById('comment-panel')?.querySelector('input')?.focus() : undefined} />
        ) : (
          <div className="flex h-full items-center justify-center sm:py-4"><div className="skeleton h-full w-full sm:aspect-[9/16] sm:w-auto sm:rounded-[28px]" /></div>
        )}
      </div>

      {wide && (
        <aside id="comment-panel" className="flex w-[420px] shrink-0 flex-col border-l border-ink-600 bg-ink-800">
          {video ? (
            <>
              <div className="border-b border-ink-600 p-5">
                <Link to={`/profile/${video.author.username}`} className="flex items-center gap-3">
                  <Avatar user={video.author} size={48} />
                  <span>
                    <span className="flex items-center gap-1 font-extrabold">@{video.author.username}{video.author.isVerified && <BadgeCheck size={15} className="text-lime" />}</span>
                    <span className="font-mono text-xs text-paper-mute">{timeAgo(video.createdAt)}</span>
                  </span>
                </Link>
                <h1 className="mt-4 text-2xl font-extrabold">{video.title}</h1>
                {video.description && <p className="mt-2 whitespace-pre-wrap text-paper-dim">{video.description}</p>}
                {video.hashtags.length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-2 font-mono text-sm font-bold">{video.hashtags.map((t) => <Link key={t} to={`/search?q=%23${t}`} className="hover:text-lime">#{t}</Link>)}</p>
                )}
                <div className="mt-4 flex gap-6 font-mono text-sm">
                  <span><b>{formatCount(video.viewCount)}</b> <span className="text-paper-mute">xem</span></span>
                  <span><b>{formatCount(video.likeCount)}</b> <span className="text-paper-mute">thích</span></span>
                  <span><b>{formatCount(comments)}</b> <span className="text-paper-mute">bình luận</span></span>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5">
                <CommentList videoId={video._id} allowComment={video.allowComment !== false} onCountChange={(d) => setComments((c) => c + d)} />
              </div>
            </>
          ) : (
            <div className="space-y-3 p-5"><span className="skeleton block h-12 w-48 rounded-xl" /><span className="skeleton block h-6 w-full rounded" /><span className="skeleton block h-6 w-2/3 rounded" /></div>
          )}
        </aside>
      )}
    </div>
  );
}
