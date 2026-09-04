import { useState } from 'react';
import Header from '../../components/layout/Header';
import Sidebar from '../../components/layout/Sidebar';
import VideoUploader from '../../components/video/VideoUploader';
import Button from '../../components/common/Button';
import { uploadVideoFile, createVideo } from '../../api/video.api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const navigate = useNavigate();

  const handleUpload = async () => {
    if (!file || !title) return toast.error('Vui lòng chọn video và nhập tiêu đề');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('video', file);
      const res = await uploadVideoFile(formData, setProgress);
      await createVideo({ title, originalUrl: res.url });
      toast.success('Tải lên thành công!');
      navigate('/');
    } catch (err) {
      toast.error('Lỗi tải lên');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 pt-16">
        <Sidebar />
        <main className="flex-1 lg:ml-64 p-8 bg-white/5">
          <div className="max-w-4xl mx-auto glass p-8 rounded-2xl">
            <h1 className="text-2xl font-bold mb-6">Tải lên video</h1>
            {!file ? (
              <VideoUploader onFileSelect={setFile} />
            ) : (
              <div className="flex flex-col gap-6">
                <div className="flex gap-4 items-center">
                  <div className="w-32 h-48 bg-black rounded-lg flex items-center justify-center text-sm">Preview</div>
                  <div className="flex-1">
                    <p className="font-semibold mb-1">{file.name}</p>
                    <p className="text-sm text-gray-400">{(file.size/1024/1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Tiêu đề</label>
                  <input type="text" value={title} onChange={e=>setTitle(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-brand-from" />
                </div>
                {uploading && (
                  <div className="w-full bg-white/10 rounded-full h-2.5">
                    <div className="bg-brand-from h-2.5 rounded-full transition-all" style={{width: `${progress}%`}}></div>
                  </div>
                )}
                <div className="flex gap-4 justify-end mt-4">
                  <Button variant="ghost" onClick={() => setFile(null)} disabled={uploading}>Hủy</Button>
                  <Button onClick={handleUpload} loading={uploading}>Đăng</Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
