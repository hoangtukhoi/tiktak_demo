import { useState, useRef } from 'react';
import { UploadCloud } from 'lucide-react';
export default function VideoUploader({ onFileSelect }) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);
  
  const handleDrag = e => { e.preventDefault(); e.stopPropagation(); if(e.type === 'dragenter' || e.type === 'dragover') setDragActive(true); else setDragActive(false); };
  const handleDrop = e => { e.preventDefault(); e.stopPropagation(); setDragActive(false); if(e.dataTransfer.files && e.dataTransfer.files[0]) onFileSelect(e.dataTransfer.files[0]); };
  const handleChange = e => { e.preventDefault(); if(e.target.files && e.target.files[0]) onFileSelect(e.target.files[0]); };

  return (
    <div onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop} className={`w-full max-w-2xl mx-auto h-80 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-6 text-center transition-colors ${dragActive ? 'border-brand-from bg-brand-from/10' : 'border-white/20 hover:border-white/40 hover:bg-white/5'}`}>
      <UploadCloud className="w-16 h-16 text-gray-400 mb-4" />
      <h3 className="text-xl font-bold mb-2">Chọn video để tải lên</h3>
      <p className="text-gray-400 mb-6">Hoặc kéo và thả tập tin vào đây</p>
      <p className="text-sm text-gray-500 mb-6">MP4 hoặc WebM<br/>Độ phân giải 720x1280 trở lên<br/>Tối đa 10 phút<br/>Nhỏ hơn 500 MB</p>
      <input ref={inputRef} type="file" accept="video/mp4,video/webm" onChange={handleChange} className="hidden" />
      <button onClick={() => inputRef.current?.click()} className="bg-brand-from hover:bg-brand-to text-white font-bold py-2 px-8 rounded-lg transition">Chọn tập tin</button>
    </div>
  );
}
