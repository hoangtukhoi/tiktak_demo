import { useEffect, useRef, useState } from 'react';
import { Volume1, Volume2, VolumeX } from 'lucide-react';
import useVideoStore from '../../store/slices/videoSlice';

const clamp = (v) => Math.max(0, Math.min(1, v));

/**
 * Nút âm lượng có thanh kéo (kiểu TikTok web):
 * - Máy tính: rê chuột vào nút → thanh kéo trượt ra bên trái; bấm nút để bật/tắt tiếng.
 * - Điện thoại: chạm nút để mở thanh kéo, chạm lần nữa để bật/tắt tiếng; tự thu lại sau vài giây.
 * - Kéo về 0 = tắt tiếng; kéo lên khi đang tắt tiếng = bật lại. Bàn phím: ←/→ hoặc ↑/↓ khi thanh đang focus.
 * Âm lượng được lưu (zustand persist) nên áp dụng cho mọi video.
 */
export default function VolumeControl({ className = '' }) {
  const { isMuted, volume, toggleMute, setVolume } = useVideoStore();
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef(null);
  const closeTimer = useRef(null);
  const level = isMuted ? 0 : volume;

  const scheduleClose = (ms = 2500) => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), ms);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const apply = (v) => {
    const next = clamp(Math.round(v * 100) / 100);
    const { isMuted: muted } = useVideoStore.getState();
    if (next === 0) {
      if (!muted) toggleMute();
      return;
    }
    setVolume(next);
    if (muted) toggleMute();
  };

  const fromPointer = (e) => {
    const r = trackRef.current.getBoundingClientRect();
    apply((e.clientX - r.left) / r.width);
  };

  const onPointerDown = (e) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    clearTimeout(closeTimer.current);
    fromPointer(e);
  };
  const onPointerMove = (e) => dragging && fromPointer(e);
  const onPointerUp = (e) => {
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (e.pointerType !== 'mouse') scheduleClose();
  };

  const onKeyDown = (e) => {
    const step = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    e.stopPropagation(); // không để phím mũi tên chuyển video
    apply(level + step);
  };

  const onButton = (e) => {
    // Cảm ứng: lần chạm đầu chỉ mở thanh kéo
    if (!open && e.nativeEvent.pointerType && e.nativeEvent.pointerType !== 'mouse') {
      setOpen(true);
      scheduleClose();
      return;
    }
    // Bật lại tiếng mà âm lượng đã lưu gần như 0 (do kéo về 0) → bật ở mức vừa phải
    if (isMuted && volume < 0.1) setVolume(0.5);
    toggleMute();
    if (open && e.nativeEvent.pointerType !== 'mouse') scheduleClose();
  };

  const Icon = level === 0 ? VolumeX : level < 0.5 ? Volume1 : Volume2;
  const expanded = open || dragging;

  return (
    <div
      data-no-tap
      onClick={(e) => e.stopPropagation()}
      // Chỉ chuột thật mới mở/đóng theo rê chuột (màn hình cảm ứng giả lập mouseover sau mỗi lần chạm)
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') { clearTimeout(closeTimer.current); setOpen(true); } }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse' && !dragging) scheduleClose(300); }}
      className={`flex h-9 items-center rounded-full bg-black/35 text-white backdrop-blur-md transition-[background-color] duration-200 hover:bg-black/55 ${className}`}
    >
      <div
        className={`overflow-hidden transition-[width,opacity] duration-300 ease-out ${expanded ? 'w-28 opacity-100' : 'w-0 opacity-0'}`}
        aria-hidden={!expanded}
      >
        <div
          role="slider"
          tabIndex={expanded ? 0 : -1}
          aria-label="Âm lượng"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(level * 100)}
          aria-valuetext={level === 0 ? 'Tắt tiếng' : `${Math.round(level * 100)}%`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          onFocus={() => { clearTimeout(closeTimer.current); setOpen(true); }}
          onBlur={() => scheduleClose(800)}
          className="group/vol ml-3 mr-1 flex h-9 cursor-pointer touch-none items-center"
        >
          <div ref={trackRef} className="relative h-1 w-full rounded-full bg-white/30">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${level * 100}%` }} />
            <div
              className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${dragging ? 'scale-125' : 'group-hover/vol:scale-110'}`}
              style={{ left: `${level * 100}%` }}
            />
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onButton}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
        aria-label={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
        title={`${isMuted ? 'Bật tiếng' : 'Tắt tiếng'} (M)`}
      >
        <Icon size={18} />
      </button>
    </div>
  );
}
