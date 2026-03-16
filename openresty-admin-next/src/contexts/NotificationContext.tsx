'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface NotificationOptions {
  type?: NotificationType;
  autoHideDuration?: number;
}

interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  autoHideDuration: number;
}

interface NotificationContextType {
  notifications: Notification[];
  notify: (message: string, options?: NotificationOptions) => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const counterRef = useRef(0);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, options?: NotificationOptions) => {
      const id = `notification-${++counterRef.current}`;
      const type = options?.type ?? 'info';
      const autoHideDuration = options?.autoHideDuration ?? 5000;

      const notification: Notification = { id, message, type, autoHideDuration };
      setNotifications((prev) => [...prev, notification]);

      if (autoHideDuration > 0) {
        setTimeout(() => {
          removeNotification(id);
        }, autoHideDuration);
      }
    },
    [removeNotification],
  );

  return (
    <NotificationContext.Provider value={{ notifications, notify, removeNotification }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextType {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
