import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { updateVideo } from '../../api/video.api';
import { errMsg } from '../../api/axiosClient';
import { parseHashtags } from '../../utils/format';
import { VISIBILITY } from '../../utils/constants';

/** Sửa video của chính mình: PATCH /videos/:id */
export default function EditVideoDialog({ video, open, onClose, onSaved }) {
  const init = () => ({ title: video.title || '', description: video.description || '', tags: video.hashtags.map((t) => '#' + t).join(' '),
    visibility: video.visibility, allowComment: video.allowComment !== false, allowDuet: video.allowDuet !== false });
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF(init()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const save = async () => {
    if (!f.title.trim()) return toast.error('Tiêu đề không được trống');
    setBusy(true);
    try {
      const v = await updateVideo(video._id, { title: f.title.trim(), description: f.description.trim(), hashtags: parseHashtags(f.tags),
        visibility: f.visibility, isPrivate: f.visibility === 'private', allowComment: f.allowComment, allowDuet: f.allowDuet });
      onSaved({ ...video, ...v, author: video.author, src: video.src });
      toast('Đã lưu thay đổi');
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Chỉnh sửa video" variant="dialog" width={520}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Huỷ</Button><Button loading={busy} onClick={save}>Lưu</Button></div>}>
      <div className="space-y-4 px-5 py-4">
        <label className="block"><span className="label">Tiêu đề</span><input className="input" maxLength={200} value={f.title} onChange={set('title')} /></label>
        <label className="block"><span className="label">Mô tả</span><textarea className="input min-h-[88px] resize-y" maxLength={2000} value={f.description} onChange={set('description')} /></label>
        <label className="block"><span className="label">Hashtag</span><input className="input" value={f.tags} onChange={set('tags')} placeholder="#travel #hanoi" /></label>
        <label className="block"><span className="label">Ai có thể xem</span>
          <select className="input" value={f.visibility} onChange={set('visibility')}>
            {VISIBILITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-base"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={f.allowComment} onChange={set('allowComment')} /> Cho phép bình luận</label>
          <label className="flex items-center gap-2 text-base"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={f.allowDuet} onChange={set('allowDuet')} /> Cho phép Duet</label>
        </div>
      </div>
    </Modal>
  );
}
