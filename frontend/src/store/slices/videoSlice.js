import { create } from 'zustand';
import { persist } from 'zustand/middleware';
const useVideoStore = create(persist(
  (set) => ({ isMuted: true, volume: 0.8, currentVideoId: null,
    toggleMute: () => set(s => ({ isMuted: !s.isMuted })),
    setVolume: (v) => set({ volume: v }),
    setCurrentVideoId: (id) => set({ currentVideoId: id }),
  }),
  { name: 'video-prefs', partialize: s => ({ isMuted: s.isMuted, volume: s.volume }) }
));
export default useVideoStore;
