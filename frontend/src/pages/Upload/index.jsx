import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import Header from '../../components/layout/Header';
import Sidebar from '../../components/layout/Sidebar';
import VideoUploader from '../../components/video/VideoUploader';
import Button from '../../components/common/Button';
import { uploadVideoFile, subscribeProgress } from '../../api/video.api';
import { getSupportedLanguages } from '../../api/dubbing.api';
import { MAX_VIDEO_SIZE_MB } from '../../utils/constants';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [originalLang, setOriginalLang] = useState('vi');
  const [languages, setLanguages] = useState([]);
  const [isPrivate, setIsPrivate] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [processing, setProcessing] = useState(null);

  const esRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    getSupportedLanguages().then(setLanguages).catch(() => {});
    return () => esRef.current?.close();
  }, []);

  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleUpload = async () => {
    if (!file) return toast.error('Hãy chọn video');
    if (!title.trim()) return toast.error('Hãy nhập tiêu đề');
    if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
      return toast.error(`Video vượt quá ${MAX_VIDEO_SIZE_MB} MB`);
    }

    setUploading(true);
    setUploadPercent(0);

    try {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('hashtags', hashtags);
      formData.append('originalLang', originalLang);
      formData.append('isPrivate', String(isPrivate));

      const result = await uploadVideoFile(formData, setUploadPercent);
      toast.success('Tải lên xong, video đang được xử lý');

      // Server xử lý nền, theo dõi tiến trình qua SSE rồi mới chuyển trang.
      setProcessing({ percent: 0, message: 'Đang chờ xử lý' });
      esRef.current = subscribeProgress(
        result.jobId,
        (data) => setProcessing(data),
        (data) => {
          if (data.status === 'completed') {
            toast.success('Video đã sẵn sàng');
            navigate(`/watch/${result.videoId}`);
          } else {
            toast.error(`Xử lý thất bại: ${data.message}`);
            setUploading(false);
          }
        }
      );
    } catch (err) {
      toast.error(err.response?.data?.message || 'Tải lên thất bại');
      setUploading(false);
    }
  };

  const reset = () => {
    esRef.current?.close();
    setFile(null);
    setProcessing(null);
    setUploading(false);
    setUploadPercent(0);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 pt-16">
        <Sidebar />
        <main className="flex-1 lg:ml-64 p-4 sm:p-8 bg-white/5">
          <div className="max-w-4xl mx-auto glass p-6 sm:p-8 rounded-2xl">
            <h1 className="text-2xl font-bold mb-6">Tải lên video</h1>

            {!file ? (
              <VideoUploader onFileSelect={setFile} />
            ) : (
              <div className="flex flex-col gap-6">
                <div className="flex gap-4 items-start">
                  {previewUrl && (
                    <video
                      src={previewUrl}
                      className="w-32 h-48 object-cover bg-black rounded-lg"
                      muted
                      playsInline
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{file.name}</p>
                    <p className="text-sm text-gray-400">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Tiêu đề</label>
                  <input
                    type="text"
                    value={title}
                    maxLength={200}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-from"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Mô tả</label>
                  <textarea
                    value={description}
                    maxLength={2000}
                    rows={3}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-from resize-none"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Hashtag</label>
                    <input
                      type="text"
                      value={hashtags}
                      placeholder="hoctap, review"
                      onChange={(e) => setHashtags(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-from"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Ngôn ngữ trong video</label>
                    <select
                      value={originalLang}
                      onChange={(e) => setOriginalLang(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-from"
                    >
                      {languages.map((l) => (
                        <option key={l.code} value={l.code} className="bg-neutral-900">
                          {l.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      Dùng làm ngôn ngữ gốc khi tạo bản lồng tiếng
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="accent-brand-from"
                  />
                  Chỉ mình tôi xem được
                </label>

                {uploading && (
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-sm text-gray-300">
                      <span>{processing ? processing.message : 'Đang tải lên'}</span>
                      <span>{processing ? `${processing.percent}%` : `${uploadPercent}%`}</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2.5">
                      <div
                        className="bg-brand-from h-2.5 rounded-full transition-all"
                        style={{ width: `${processing ? processing.percent : uploadPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-4 justify-end">
                  <Button variant="ghost" onClick={reset} disabled={uploading}>
                    Huỷ
                  </Button>
                  <Button onClick={handleUpload} loading={uploading}>
                    Đăng
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
