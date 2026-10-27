import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastMessage[];
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => void;
  removeToast: (id: string) => void;
  toast: {
    success: (message: string, title?: string) => void;
    error: (message: string, title?: string) => void;
    info: (message: string, title?: string) => void;
    warning: (message: string, title?: string) => void;
  };
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', title?: string, duration: number = 3500) => {
      const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      const newToast: ToastMessage = { id, type, title, message, duration };

      setToasts((prev) => [...prev.slice(-3), newToast]); // keep at most 4

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const toast = {
    success: (message: string, title?: string) => showToast(message, 'success', title),
    error: (message: string, title?: string) => showToast(message, 'error', title),
    info: (message: string, title?: string) => showToast(message, 'info', title),
    warning: (message: string, title?: string) => showToast(message, 'warning', title),
  };

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast, toast }}>
      {children}
      {/* Toast Render Container */}
      <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[9999] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl shadow-xl border backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-3 ${
              t.type === 'success'
                ? 'bg-slate-900/95 text-white border-slate-800'
                : t.type === 'error'
                ? 'bg-rose-950/95 text-rose-50 border-rose-900'
                : t.type === 'warning'
                ? 'bg-amber-950/95 text-amber-50 border-amber-900'
                : 'bg-slate-900/95 text-slate-100 border-slate-800'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {t.type === 'success' && <CheckCircle2 size={18} className="text-emerald-400" />}
              {t.type === 'error' && <AlertCircle size={18} className="text-rose-400" />}
              {t.type === 'warning' && <AlertTriangle size={18} className="text-amber-400" />}
              {t.type === 'info' && <Info size={18} className="text-blue-400" />}
            </div>
            <div className="flex-1 min-w-0">
              {t.title && <div className="text-xs font-bold leading-tight mb-0.5">{t.title}</div>}
              <div className="text-xs text-slate-300 leading-relaxed break-words">{t.message}</div>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="shrink-0 p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
