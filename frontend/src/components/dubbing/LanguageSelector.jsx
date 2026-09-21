import { useEffect, useState } from 'react';
import { Languages, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import Modal from '../common/Modal';
import Button from '../common/Button';
import DubbingStatusBadge from './DubbingStatusBadge';
import { getSupportedLanguages, getVideoTracks, requestDubbing } from '../../api/dubbing.api';
import useVideoStore from '../../store/slices/videoSlice';

/**
 * Cho người xem chọn ngôn ngữ lồng tiếng và phụ đề.
 * Ngôn ngữ chưa có bản dịch sẽ hiện nút yêu cầu tạo, kết quả cập nhật realtime qua socket.
 */
export default function LanguageSelector({ videoId, isOpen, onClose, onSelect }) {
  const [languages, setLanguages] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [subtitles, setSubtitles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(null);

  const { audioLang, subtitleLang, setAudioLang, setSubtitleLang } = useVideoStore();
  const dubbingState = useVideoStore((s) => s.dubbing[videoId]);

  const load = async () => {
    setLoading(true);
    try {
      const [langs, data] = await Promise.all([getSupportedLanguages(), getVideoTracks(videoId)]);
      setLanguages(langs);
      setTracks(data.audioTracks || []);
      setSubtitles(data.subtitles || []);
    } catch (err) {
      toast.error('Không tải được danh sách ngôn ngữ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && videoId) load();
  }, [isOpen, videoId]);

  // Khi worker báo xong một bản lồng tiếng, nạp lại danh sách.
  useEffect(() => {
    if (dubbingState?.status === 'done') load();
  }, [dubbingState?.status]);

  const trackOf = (code) => tracks.find((t) => t.targetLang === code);

  const handleRequest = async (code) => {
    setRequesting(code);
    try {
      await requestDubbing(videoId, code);
      toast.success('Đã gửi yêu cầu, quá trình xử lý chạy nền');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không gửi được yêu cầu');
    } finally {
      setRequesting(null);
    }
  };

  const handlePick = (code) => {
    const track = trackOf(code);
    if (!track || track.status !== 'done') return;
    setAudioLang(code);
    setSubtitleLang(code);
    onSelect?.({ lang: code, audioUrl: track.audioUrl, subtitleUrl: track.subtitleUrl });
    onClose?.();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ngôn ngữ lồng tiếng">
      {loading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-1 max-h-96 overflow-y-auto">
          <button
            onClick={() => {
              setAudioLang(null);
              setSubtitleLang(null);
              onSelect?.({ lang: null });
              onClose?.();
            }}
            className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 text-left"
          >
            <span>Giọng gốc</span>
            {!audioLang && <Check className="w-5 h-5 text-brand-from" />}
          </button>

          {languages.map((lang) => {
            const track = trackOf(lang.code);
            const hasSubtitle = subtitles.some((s) => s.lang === lang.code);
            const isReady = track?.status === 'done';

            return (
              <div
                key={lang.code}
                className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-white/5"
              >
                <button
                  onClick={() => handlePick(lang.code)}
                  disabled={!isReady}
                  className="flex-1 text-left disabled:opacity-60 disabled:cursor-default"
                >
                  <span className="block">{lang.name}</span>
                  {hasSubtitle && !isReady && (
                    <span className="text-xs text-gray-400">Đã có phụ đề</span>
                  )}
                </button>

                {isReady && audioLang === lang.code && <Check className="w-5 h-5 text-brand-from" />}

                {track && track.status !== 'done' && (
                  <DubbingStatusBadge
                    status={
                      dubbingState?.targetLang === lang.code ? dubbingState.status : track.status
                    }
                    progress={
                      dubbingState?.targetLang === lang.code ? dubbingState.progress : track.progress
                    }
                  />
                )}

                {!track && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={requesting === lang.code}
                    onClick={() => handleRequest(lang.code)}
                  >
                    <Languages className="w-4 h-4 mr-1" />
                    Tạo
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
