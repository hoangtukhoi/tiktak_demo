import { useRef, useState, useEffect, useCallback } from 'react';
import Hls from 'hls.js';
import { recordView } from '../api/video.api';
import useVideoStore from '../store/slices/videoSlice';

export default function useVideoPlayer(videoId) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const watchStartRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const { isMuted, volume, toggleMute } = useVideoStore();

  const initHls = useCallback((src) => {
    const video = videoRef.current;
    if (!video || !src) return;
    if (src.endsWith('.m3u8') && Hls.isSupported()) {
      if (hlsRef.current) hlsRef.current.destroy();
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    } else {
      video.src = src;
    }
  }, []);

  const play = useCallback(() => {
    videoRef.current?.play();
    watchStartRef.current = Date.now();
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause();
    if (watchStartRef.current && videoId) {
      const watched = Date.now() - watchStartRef.current;
      if (watched > 3000) recordView(videoId, watched).catch(() => {});
      watchStartRef.current = null;
    }
  }, [videoId]);

  const togglePlay = useCallback(() => {
    if (videoRef.current?.paused) play(); else pause();
  }, [play, pause]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => { setDuration(video.duration); setIsBuffering(false); };
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      hlsRef.current?.destroy();
    };
  }, []);

  return { videoRef, isPlaying, currentTime, duration, isBuffering, isMuted, volume, initHls, play, pause, togglePlay, toggleMute };
}
