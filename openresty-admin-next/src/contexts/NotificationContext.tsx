"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type NotificationType = "success" | "error" | "warning" | "info";

interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number;
}

interface NotifyOptions {
  type?: NotificationType;
  duration?: number;
}

interface NotificationContextValue {
  notifications: Notification[];
  notify: (message: string, options?: NotifyOptions) => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(
  undefined,
);

const DEFAULT_DURATION = 5000;

let counter = 0;
function uid(): string {
  return `notif-${Date.now()}-${++counter}`;
}

const iconMap: Record<NotificationType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const borderColorMap: Record<NotificationType, string> = {
  success: "border-l-emerald-500",
  error: "border-l-red-500",
  warning: "border-l-amber-500",
  info: "border-l-blue-500",
};

const iconColorMap: Record<NotificationType, string> = {
  success: "text-emerald-500",
  error: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (message: string, options?: NotifyOptions) => {
      const id = uid();
      const type = options?.type ?? "info";
      const duration = options?.duration ?? DEFAULT_DURATION;
      const notif: Notification = { id, message, type, duration };

      setNotifications((prev) => [...prev, notif]);

      if (duration > 0) {
        const timer = setTimeout(() => {
          removeNotification(id);
        }, duration);
        timersRef.current.set(id, timer);
      }
    },
    [removeNotification],
  );

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({ notifications, notify, removeNotification }),
    [notifications, notify, removeNotification],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {/* Toast container */}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col gap-2">
        {notifications.map((n) => {
          const Icon = iconMap[n.type];
          return (
            <div
              key={n.id}
              className={cn(
                "pointer-events-auto flex w-80 items-start gap-3 rounded-lg border-l-4 bg-white p-4 shadow-lg dark:bg-slate-800",
                borderColorMap[n.type],
              )}
            >
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconColorMap[n.type])} />
              <p className="flex-1 text-sm text-slate-700 dark:text-slate-200">
                {n.message}
              </p>
              <button
                type="button"
                onClick={() => removeNotification(n.id)}
                className="shrink-0 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx)
    throw new Error("useNotification must be used within NotificationProvider");
  return ctx;
}
