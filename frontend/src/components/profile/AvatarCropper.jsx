import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCw, ZoomIn, ZoomOut } from 'lucide-react';

const OUTPUT_SIZE = 512; // ảnh xuất ra: 512×512 (backend cũng lưu ở cỡ này)
const LIME = '#d9ff3f';

// Style inline (không phụ thuộc class Tailwind sinh động)
const CIRCLE_MASK = {
  position: 'absolute',
  inset: 0,
  borderRadius: '50%',
  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.62)',
  border: '2px solid rgba(255, 255, 255, 0.9)',
  pointerEvents: 'none',
};
const GRID_LINE = { position: 'absolute', background: 'rgba(255, 255, 255, 0.28)', pointerEvents: 'none' };
const MAX_ZOOM = 4;

/**
 * Cắt ảnh đại diện: kéo để chọn vị trí, thanh trượt / con lăn để phóng to,
 * nút xoay 90°, xem trước trực tiếp ở các cỡ avatar thật.
 *
 * Props:
 *  - src: object URL của ảnh gốc
 *  - onCancel()
 *  - onApply(file: File, previewUrl: string)
 */
export default function AvatarCropper({ src, onCancel, onApply }) {
  const frameRef = useRef(null);
  const imgRef = useRef(null);
  const drag = useRef(null);
  const [view, setView] = useState(280); // cạnh khung cắt (px), co theo màn hình
  const [nat, setNat] = useState(null); // { w, h } kích thước gốc
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // độ lệch tâm ảnh so với tâm khung (px)
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Khung cắt co giãn theo bề rộng modal
  useEffect(() => {
    const el = frameRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setView(Math.min(300, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Kích thước "hiệu dụng" sau khi xoay và tỉ lệ để ảnh vừa phủ kín khung
  const swap = rot % 180 !== 0;
  const ew = nat ? (swap ? nat.h : nat.w) : 1;
  const eh = nat ? (swap ? nat.w : nat.h) : 1;
  const scale = (view / Math.min(ew, eh)) * zoom;

  const clamp = useCallback(
    (p, z = zoom, r = rot) => {
      if (!nat) return p;
      const sw = r % 180 !== 0;
      const w = sw ? nat.h : nat.w;
      const h = sw ? nat.w : nat.h;
      const s = (view / Math.min(w, h)) * z;
      const mx = Math.max(0, (w * s - view) / 2);
      const my = Math.max(0, (h * s - view) / 2);
      return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
    },
    [nat, view, zoom, rot]
  );

  // Khi đổi cỡ khung / zoom / xoay → giữ ảnh luôn phủ kín khung
  useEffect(() => setPos((p) => clamp(p)), [clamp]);

  const setZoomKeep = (z) => {
    const nz = Math.min(MAX_ZOOM, Math.max(1, z));
    // Phóng quanh tâm khung: độ lệch tăng theo cùng tỉ lệ
    setPos((p) => clamp({ x: (p.x * nz) / zoom, y: (p.y * nz) / zoom }, nz));
    setZoom(nz);
  };

  // ── Kéo bằng chuột / cảm ứng ──
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); // không bôi đen/kéo ảnh mặc định của trình duyệt
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, start: pos };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const { sx, sy, start } = drag.current;
    setPos(clamp({ x: start.x + e.clientX - sx, y: start.y + e.clientY - sy }));
  };
  const onPointerUp = () => { drag.current = null; };

  // Con lăn chuột để phóng to/thu nhỏ (cần listener non-passive để chặn cuộn trang)
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setZoomKeep(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // Phím mũi tên để dịch ảnh (hỗ trợ bàn phím)
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 20 : 5;
    const d = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!d) return;
    e.preventDefault();
    setPos((p) => clamp({ x: p.x + d[0], y: p.y + d[1] }));
  };

  const rotate = () => {
    const r = (rot + 90) % 360;
    setRot(r);
    setPos((p) => clamp({ x: -p.y, y: p.x }, zoom, r));
  };

  // ── Xuất ảnh đã cắt bằng canvas ──
  const apply = async () => {
    const img = imgRef.current;
    if (!img || !nat) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      const k = OUTPUT_SIZE / view;
      ctx.translate(OUTPUT_SIZE / 2 + pos.x * k, OUTPUT_SIZE / 2 + pos.y * k);
      ctx.rotate((rot * Math.PI) / 180);
      const w = nat.w * scale * k;
      const h = nat.h * scale * k;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);

      const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.9));
      if (!blob) throw new Error('Trình duyệt không xuất được ảnh');
      const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png';
      const file = new File([blob], `avatar.${ext}`, { type: blob.type });
      onApply(file, URL.createObjectURL(blob));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Ảnh dùng chung cho khung cắt và các ô xem trước
  const imgStyle = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: nat ? nat.w * scale : 'auto',
    height: nat ? nat.h * scale : 'auto',
    maxWidth: 'none',
    transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) rotate(${rot}deg)`,
  };

  const renderPreview = (size, label) => (
    <div key={label} className="flex flex-col items-center gap-1.5">
      <div className="relative overflow-hidden rounded-full bg-ink-700 ring-1 ring-ink-500" style={{ width: size, height: size }}>
        {nat && (
          <div className="absolute left-0 top-0" style={{ width: view, height: view, transform: `scale(${size / view})`, transformOrigin: '0 0' }}>
            <img src={src} alt="" draggable={false} style={imgStyle} />
          </div>
        )}
      </div>
      <span className="font-mono text-[10px] text-paper-mute">{label}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div
          ref={frameRef}
          tabIndex={0}
          role="application"
          aria-label="Khung cắt ảnh: kéo để di chuyển, cuộn hoặc dùng thanh trượt để phóng to, phím mũi tên để dịch"
          className="relative cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-lime active:cursor-grabbing"
          style={{ width: view, height: view, touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          <img
            ref={imgRef}
            src={src}
            alt="Ảnh đang cắt"
            draggable={false}
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onError={() => setError('Không đọc được ảnh này (định dạng HEIC chưa hỗ trợ — hãy chọn JPG/PNG)')}
            style={{ ...imgStyle, opacity: nat ? 1 : 0 }}
          />
          {/* Lưới 1/3 giúp căn bố cục */}
          {[1, 2].map((i) => (
            <span key={`v${i}`} style={{ ...GRID_LINE, left: `${(i * 100) / 3}%`, top: 0, bottom: 0, width: 1 }} />
          ))}
          {[1, 2].map((i) => (
            <span key={`h${i}`} style={{ ...GRID_LINE, top: `${(i * 100) / 3}%`, left: 0, right: 0, height: 1 }} />
          ))}
          {/* Vùng ngoài vòng tròn tối đi: đây là phần sẽ bị cắt bỏ */}
          <div style={CIRCLE_MASK} />
          {!nat && !error && <span className="absolute inset-0 grid place-items-center text-sm text-paper-mute">Đang tải ảnh…</span>}
        </div>
      </div>

      {error ? (
        <p className="text-center text-sm font-semibold text-coral">{error}</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setZoomKeep(zoom - 0.2)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-ink-600" aria-label="Thu nhỏ">
              <ZoomOut size={18} />
            </button>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoomKeep(Number(e.target.value))}
              className="w-full cursor-pointer"
              style={{ accentColor: LIME }}
              aria-label="Mức phóng to"
            />
            <button type="button" onClick={() => setZoomKeep(zoom + 0.2)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-ink-600" aria-label="Phóng to">
              <ZoomIn size={18} />
            </button>
            <button type="button" onClick={rotate} className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-ink-600" aria-label="Xoay 90 độ">
              <RotateCw size={18} />
            </button>
          </div>

          <div>
            <p className="label mb-3">Xem trước</p>
            <div className="flex items-end justify-center gap-6">
              {renderPreview(96, 'Hồ sơ')}
              {renderPreview(48, 'Video')}
              {renderPreview(32, 'Bình luận')}
            </div>
          </div>
        </>
      )}

      <p className="text-center text-xs text-paper-mute">Kéo ảnh để căn chỉnh · cuộn chuột hoặc dùng thanh trượt để phóng to</p>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onCancel} className="btn-ghost justify-center">Huỷ</button>
        <button type="button" onClick={apply} disabled={!nat || !!error || busy} className="btn justify-center disabled:opacity-50">
          {busy ? 'Đang xử lý…' : 'Áp dụng'}
        </button>
      </div>
    </div>
  );
}
