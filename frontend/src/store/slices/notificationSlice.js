import { create } from 'zustand';
const useNotificationStore = create(set => ({
  notifications: [], unreadCount: 0,
  addNotification: (n) => set(s => ({ notifications: [n, ...s.notifications], unreadCount: s.unreadCount + 1 })),
  setUnreadCount: (n) => set({ unreadCount: n }),
  markRead: () => set({ unreadCount: 0 }),
}));
export default useNotificationStore;
