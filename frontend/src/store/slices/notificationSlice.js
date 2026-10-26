import { create } from 'zustand';

const useNotificationStore = create((set) => ({
  notifications: [],
  unreadCount: 0,
  setNotifications: (notifications) => set({ notifications }),
  addNotification: (n) => set((s) => ({ notifications: [n, ...s.notifications], unreadCount: s.unreadCount + 1 })),
  setUnreadCount: (n) => set({ unreadCount: n }),
  markRead: () => set((s) => ({ unreadCount: 0, notifications: s.notifications.map((n) => ({ ...n, isRead: true })) })),
  reset: () => set({ notifications: [], unreadCount: 0 }),
}));

export default useNotificationStore;
