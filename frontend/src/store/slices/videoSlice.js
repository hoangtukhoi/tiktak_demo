import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useVideoStore = create(
  persist(
    (set) => ({
      isMuted: true,
      volume: 0.8,
      currentVideoId: null,

      // Ngôn ngữ lồng tiếng và phụ đề người dùng chọn trên player.
      audioLang: null,
      subtitleLang: null,

      // Tiến trình transcode và lồng tiếng, key theo videoId.
      processing: {},
      dubbing: {},

      toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
      setVolume: (v) => set({ volume: v }),
      setCurrentVideoId: (id) => set({ currentVideoId: id }),
      setAudioLang: (lang) => set({ audioLang: lang }),
      setSubtitleLang: (lang) => set({ subtitleLang: lang }),

      setProcessingState: (videoId, data) =>
        set((s) => ({ processing: { ...s.processing, [videoId]: data } })),
      setDubbingState: (videoId, data) =>
        set((s) => ({ dubbing: { ...s.dubbing, [videoId]: data } })),
    }),
    {
      name: 'video-prefs',
      partialize: (s) => ({
        isMuted: s.isMuted,
        volume: s.volume,
        audioLang: s.audioLang,
        subtitleLang: s.subtitleLang,
      }),
    }
  )
);

export default useVideoStore;
