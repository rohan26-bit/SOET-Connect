import { createContext, useState, useMemo } from "react";
import { demoNotifications } from "../data/mockData";

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  // Local React session state for demo notifications
  const [notifications, setNotifications] = useState(demoNotifications);

  // Dynamic unread count
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  // Mark single notification as read
  const markAsRead = (id) => {
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isRead: true } : item))
    );
  };

  // Mark single notification as unread
  const markAsUnread = (id) => {
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isRead: false } : item))
    );
  };

  // Mark all notifications as read
  const markAllAsRead = () => {
    setNotifications((prev) =>
      prev.map((item) => ({ ...item, isRead: true }))
    );
  };

  // Delete notification from session state
  const deleteNotification = (id) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  };

  // Reset to default demo notifications
  const resetNotifications = () => {
    setNotifications(demoNotifications);
  };

  const value = {
    notifications,
    unreadCount,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    deleteNotification,
    resetNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export { NotificationContext };

