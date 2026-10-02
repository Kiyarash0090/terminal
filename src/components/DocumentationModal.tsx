import React, { useEffect } from 'react';
import { X, BookOpen, Command } from 'lucide-react';
import { Language } from '../types';
import { DocumentationView } from './DocumentationView';

interface DocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const DocumentationModal: React.FC<DocumentationModalProps> = ({
  isOpen,
  onClose,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      {/* Modal Dialog Window */}
      <div 
        className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/15 rounded-xl sm:rounded-3xl shadow-2xl w-full max-w-4xl max-h-[94vh] sm:max-h-[88vh] flex flex-col overflow-hidden transition-all duration-200"
        dir={isFa ? 'rtl' : 'ltr'}
      >
        {/* Modal Header */}
        <div className="px-3 sm:px-6 py-2.5 sm:py-3.5 border-b border-neutral-200 dark:border-white/10 flex items-center justify-between bg-neutral-50/80 dark:bg-white/[0.03] shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 shrink-0">
              <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs sm:text-base font-bold text-neutral-900 dark:text-white">
                  {isFa ? 'راهنمای سریع و داکیومنت سامانه' : 'System Guide & Documentation'}
                </h3>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                  <Command className="h-2.5 w-2.5" />
                  Shift + ? / F1
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                {isFa
                  ? 'دستورات ترمینال، تانل VPN، ربات تلگرام، مدیریت فایل و دیتابیس'
                  : 'Instant access to terminal shortcuts, VPN commands, Telegram bot & file manager'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 sm:p-2 rounded-xl text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition cursor-pointer"
            title={isFa ? 'بستن (Esc)' : 'Close (Esc)'}
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        {/* Modal Body - Scrollable Documentation Content */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-5 custom-scrollbar">
          <DocumentationView lang={lang} isModalView={true} autoFocusSearch={true} />
        </div>

        {/* Modal Footer */}
        <div className="px-3 sm:px-6 py-2 sm:py-2.5 border-t border-neutral-200 dark:border-white/10 bg-neutral-50/80 dark:bg-white/[0.02] flex items-center justify-between text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 shrink-0">
          <div className="flex items-center gap-1.5">
            <span>{isFa ? 'میانبر باز کردن:' : 'Shortcut:'}</span>
            <kbd className="px-1.5 py-0.5 bg-neutral-200 dark:bg-neutral-800 rounded font-mono text-neutral-700 dark:text-neutral-300 text-[9px] sm:text-[10px] border border-neutral-300 dark:border-neutral-700">
              Shift + ?
            </kbd>
            <span className="text-neutral-300 dark:text-neutral-700">|</span>
            <kbd className="px-1.5 py-0.5 bg-neutral-200 dark:bg-neutral-800 rounded font-mono text-neutral-700 dark:text-neutral-300 text-[9px] sm:text-[10px] border border-neutral-300 dark:border-neutral-700">
              F1
            </kbd>
          </div>

          <button
            onClick={onClose}
            className="px-3 py-1 sm:px-3.5 sm:py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-[11px] sm:text-xs transition cursor-pointer shadow-sm"
          >
            {isFa ? 'متوجه شدم (بستن)' : 'Got it (Close)'}
          </button>
        </div>
      </div>
    </div>
  );
};
