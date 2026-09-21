import { useEffect } from 'react';
import { Play, Volume2, VolumeX } from 'lucide-react';

import useVideoPlayer from '../../hooks/useVideoPlayer';
import Spinner from '../common/Spinner';

/**
 * Player cho một video trong feed.
 * dubbedAudioUrl khác null nghĩa là người xem đang chọn bản lồng tiếng:
 * video gốc bị tắt tiếng và audio dịch phát song song.
 */
export default function VideoPlayer({
  src,
  poster,
  autoPlay = true,
  isActive,
  videoId,
  dubbedAudioUrl = null,
  subtitleUrl = null,
  subtitleLang = null,
}) {
  const {
    videoRef,
    dubbedAudioRef,
    isPlaying,
    isBuffering,
    error,
    isMuted,
    initHls,
    togglePlay,
    toggleMute,
    play,
    pause,
  } = useVideoPlayer(videoId);

  useEffect(() => {
    if (isActive) initHls(src);
  }, [isActive, src, initHls]);

  useEffect(() => {
    if (isActive && autoPlay) play();
    else pause();
  }, [isActive, autoPlay, play, pause]);

  return (
    <div className="relative w-full h-full bg-black group" onClick={togglePlay}>
      <video
        ref={videoRef}
        poster={poster}
        muted={isMuted || Boolean(dubbedAudioUrl)}
        loop
        playsInline
        crossOrigin="anonymous"
        className="w-full h-full object-cover"
      >
        {subtitleUrl && (
          <track
            kind="subtitles"
            src={subtitleUrl}
            srcLang={subtitleLang || 'vi'}
            label={subtitleLang || 'Phụ đề'}
            default
          />
        )}
      </video>

      {dubbedAudioUrl && (
        <audio ref={dubbedAudioRef} src={dubbedAudioUrl} muted={isMuted} loop preload="auto" />
      )}

      {isBuffering && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-300">
          {error}
        </div>
      )}

      {!isPlaying && !isBuffering && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Play className="w-16 h-16 text-white/80" fill="currentColor" />
        </div>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleMute();
        }}
        aria-label={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
        className="absolute bottom-4 right-4 p-2 rounded-full bg-black/40 hover:bg-black/60 transition opacity-0 group-hover:opacity-100"
      >
        {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
      </button>
    </div>
  );
}
