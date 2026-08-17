import React, { useEffect } from 'react';
import { X, Bot, Send } from 'lucide-react';
import { Language } from '../types';
import { TelegramBotManager } from './TelegramBotManager';

interface TelegramBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  lang: Language;
}

export const TelegramBotModal: React.FC<TelegramBotModalProps> = ({
  isOpen,
  onClose,
  token,
  lang,
}) => {
  const isFa = lang === 'fa';

  // Handle ESC key press to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      {/* Modal Dialog Container */}
      <div 
        className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/15 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden transition-all duration-200"
        dir={isFa ? 'rtl' : 'ltr'}
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-neutral-200 dark:border-white/10 flex items-center justify-between bg-sky-500/5 dark:bg-sky-500/10 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="p-2 sm:p-2.5 rounded-xl bg-sky-500/15 text-sky-500 border border-sky-500/30 shrink-0">
              <Bot className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                  {isFa ? 'مدیریت و کنترل ربات تلگرام' : 'Telegram Bot Management'}
                </h3>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                  <Send className="h-2.5 w-2.5" />
                  {isFa ? 'دستیار هوشمند' : 'Smart Bot'}
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 hidden sm:block">
                {isFa
                  ? 'تنظیم توکن ربات، دریافت هشدارهای سرور و مشاهده لاگ‌های زنده تلگرام'
                  : 'Configure bot token, receive threshold alerts & view live bot logs'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition cursor-pointer"
            title={isFa ? 'بستن (Esc)' : 'Close (Esc)'}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body - Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 custom-scrollbar">
          <TelegramBotManager token={token} lang={lang} />
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-t border-neutral-200 dark:border-white/10 bg-neutral-50/80 dark:bg-white/[0.02] flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 shrink-0">
          <span>
            {isFa ? 'برای خروج کلید Esc را بفشارید' : 'Press Esc to close'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium text-xs transition cursor-pointer shadow-sm"
          >
            {isFa ? 'بستن پنجره' : 'Close Window'}
          </button>
        </div>
      </div>
    </div>
  );
};
