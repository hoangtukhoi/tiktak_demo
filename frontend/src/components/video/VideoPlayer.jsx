import { useEffect } from 'react';
import { Play, Volume2, VolumeX } from 'lucide-react';
import useVideoPlayer from '../../hooks/useVideoPlayer';
import Spinner from '../common/Spinner';
export default function VideoPlayer({ src, poster, autoPlay, isActive, videoId }) {
  const { videoRef, isPlaying, isBuffering, isMuted, initHls, togglePlay, toggleMute, play, pause } = useVideoPlayer(videoId);
  
  useEffect(() => {
    if (isActive) initHls(src);
  }, [isActive, src, initHls]);

  useEffect(() => {
    if (isActive && autoPlay) {
      play();
    } else {
      pause();
    }
  }, [isActive, autoPlay, play, pause]);

  return (
    <div className="relative w-full h-full bg-black group" onClick={togglePlay}>
      <video ref={videoRef} poster={poster} muted={isMuted} loop playsInline className="w-full h-full object-cover" />
      {isBuffering && <div className="absolute inset-0 flex items-center justify-center bg-black/20"><Spinner size="lg" /></div>}
      {!isPlaying && !isBuffering && <div className="absolute inset-0 flex items-center justify-center bg-black/20"><Play className="w-16 h-16 text-white/80" fill="currentColor" /></div>}
      <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="absolute bottom-4 right-4 p-2 rounded-full bg-black/40 hover:bg-black/60 transition opacity-0 group-hover:opacity-100">
        {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
      </button>
    </div>
  );
}
