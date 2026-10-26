import { useEffect, useRef, useState, useCallback } from 'react';
import useVideoStore from '../store/slices/videoSlice';

/**
 * Điều khiển 1 <video>: gắn nguồn HLS (hls.js, tải lười) hoặc MP4, tự phát khi `active`,
 * thanh tiến trình cập nhật bằng rAF trực tiếp lên DOM (không re-render 60fps).
 */
export default function useVideoPlayer(src, active, { forceMute = false } = {}) {
  const videoRef = useRef(null);
  const barRef = useRef(null);
  const { isMuted, volume } = useVideoStore();
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);

  // Gắn nguồn
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    setError(false);
    if (src.includes('.m3u8') && !v.canPlayType('application/vnd.apple.mpegurl')) {
      let hls;
      let cancelled = false;
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled || !Hls.isSupported()) return;
        hls = new Hls({ maxBufferLength: 12, startLevel: -1 });
        hls.on(Hls.Events.ERROR, (_, d) => d.fatal && setError(true));
        hls.loadSource(src);
        hls.attachMedia(v);
      });
      return () => { cancelled = true; hls?.destroy(); };
    }
    v.src = src;
    return () => { v.removeAttribute('src'); v.load(); };
  }, [src]);

  // Rời video -> reset
  useEffect(() => {
    if (active) return;
    setUserPaused(false);
    const v = videoRef.current;
    if (v && v.readyState > 0) v.currentTime = 0;
  }, [active]);

  // Phát / dừng
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    if (active && !userPaused) {
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    } else v.pause();
  }, [active, userPaused, src]);

  // Âm lượng
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = forceMute || isMuted;
    v.volume = volume;
  }, [isMuted, volume, forceMute]);

  // Thanh tiến trình mượt
  useEffect(() => {
    if (!playing) return;
    let raf;
    const loop = () => {
      const v = videoRef.current;
      if (v && barRef.current && v.duration) barRef.current.style.transform = `scaleX(${v.currentTime / v.duration})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const toggle = useCallback(() => setUserPaused((p) => !p), []);
  const seek = useCallback((frac) => {
    const v = videoRef.current;
    if (v?.duration) {
      v.currentTime = Math.max(0, Math.min(1, frac)) * v.duration;
      if (barRef.current) barRef.current.style.transform = `scaleX(${frac})`;
    }
  }, []);

  const bind = {
    playsInline: true,
    loop: true,
    preload: active ? 'auto' : 'metadata',
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onWaiting: () => setBuffering(true),
    onPlaying: () => setBuffering(false),
    onTimeUpdate: (e) => setTime(e.currentTarget.currentTime),
    onLoadedMetadata: (e) => setDuration(e.currentTarget.duration || 0),
    onError: () => setError(true),
  };

  return { videoRef, barRef, bind, playing, paused: userPaused, buffering, time, duration, error, toggle, seek };
}
