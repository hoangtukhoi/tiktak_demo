import { useRef, useState, useEffect, useCallback } from 'react';
import Hls from 'hls.js';

import { recordView } from '../api/video.api';
import useVideoStore from '../store/slices/videoSlice';

const MIN_COUNTED_WATCH_MS = 3000;

/**
 * Quản lý một thẻ video: phát HLS, theo dõi thời gian xem,
 * và hỗ trợ thay audio track bằng một thẻ <audio> chạy song song
 * khi người xem chọn bản lồng tiếng.
 */
export default function useVideoPlayer(videoId) {
  const videoRef = useRef(null);
  const dubbedAudioRef = useRef(null);
  const hlsRef = useRef(null);
  const watchStartRef = useRef(null);
  const viewCountedRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const [error, setError] = useState(null);

  const { isMuted, volume, toggleMute } = useVideoStore();

  const initHls = useCallback((src) => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHls = src.includes('.m3u8');
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 20, capLevelToPlayerSize: true });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) setError('Không phát được video');
      });
      hlsRef.current = hls;
    } else {
      // Safari phát HLS gốc, các định dạng khác gán trực tiếp.
      video.src = src;
    }
  }, []);

  const flushWatchTime = useCallback(() => {
    if (!watchStartRef.current || !videoId) return;
    const watched = Date.now() - watchStartRef.current;
    watchStartRef.current = null;
    if (watched >= MIN_COUNTED_WATCH_MS && !viewCountedRef.current) {
      viewCountedRef.current = true;
      recordView(videoId, watched).catch(() => {});
    }
  }, [videoId]);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {});
    dubbedAudioRef.current?.play().catch(() => {});
    watchStartRef.current = Date.now();
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause();
    dubbedAudioRef.current?.pause();
    flushWatchTime();
  }, [flushWatchTime]);

  const togglePlay = useCallback(() => {
    if (videoRef.current?.paused) play();
    else pause();
  }, [play, pause]);

  const seek = useCallback((seconds) => {
    if (videoRef.current) videoRef.current.currentTime = seconds;
    if (dubbedAudioRef.current) dubbedAudioRef.current.currentTime = seconds;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      // Giữ audio lồng tiếng bám theo video, lệch quá 0.3s thì kéo về.
      const audio = dubbedAudioRef.current;
      if (audio && Math.abs(audio.currentTime - video.currentTime) > 0.3) {
        audio.currentTime = video.currentTime;
      }
    };
    const onLoadedMetadata = () => {
      setDuration(video.duration);
      setIsBuffering(false);
    };
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onEnded = () => flushWatchTime();

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('ended', onEnded);
      flushWatchTime();
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [flushWatchTime]);

  return {
    videoRef,
    dubbedAudioRef,
    isPlaying,
    currentTime,
    duration,
    isBuffering,
    error,
    isMuted,
    volume,
    initHls,
    play,
    pause,
    togglePlay,
    seek,
    toggleMute,
  };
}
