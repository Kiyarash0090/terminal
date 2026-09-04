import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, X, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import { Language } from '../types';

export interface UndoToastProps {
  id: string;
  message: string;
  subMessage?: string;
  duration?: number; // duration in ms, default 10000
  onUndo: () => Promise<void> | void;
  onClose: () => void;
  lang?: Language;
}

export const UndoToast: React.FC<UndoToastProps> = ({
  id,
  message,
  subMessage,
  duration = 10000,
  onUndo,
  onClose,
  lang = 'fa'
}) => {
  const isFa = lang === 'fa';
  const [progress, setProgress] = useState(100);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const onUndoRef = useRef(onUndo);
  useEffect(() => {
    onUndoRef.current = onUndo;
  }, [onUndo]);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onCloseRef.current();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [id, duration]);

  const handleUndoClick = async () => {
    setIsUndoing(true);
    try {
      await onUndoRef.current();
      setIsDone(true);
      setTimeout(() => {
        onCloseRef.current();
      }, 1200);
    } catch (e) {
      setIsUndoing(false);
    }
  };

  return (
    <div className="fixed bottom-5 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-[120] animate-fadeIn transition-all transform">
      <div className="bg-neutral-900/95 dark:bg-neutral-900/95 border border-neutral-700/80 text-white rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md">
        {/* Animated Progress Bar */}
        {!isDone && (
          <div className="h-1 bg-neutral-800 w-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 via-rose-500 to-amber-400 transition-all duration-75 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
          {/* Status Icon & Message */}
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2 rounded-xl shrink-0 ${isDone ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
              {isDone ? <CheckCircle2 className="h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
            </div>

            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-semibold text-neutral-100 truncate">
                {isDone ? (isFa ? 'با موفقیت بازگردانی شد' : 'Restored successfully') : message}
              </p>
              {subMessage && !isDone && (
                <p className="text-[11px] text-neutral-400 font-mono truncate mt-0.5 dir-ltr text-right sm:text-left">
                  {subMessage}
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {!isDone && (
              <button
                type="button"
                onClick={handleUndoClick}
                disabled={isUndoing}
                className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-neutral-950 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-amber-500/20 disabled:opacity-60 min-h-[38px]"
              >
                {isUndoing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span>{isFa ? 'در حال بازگردانی...' : 'Restoring...'}</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4 shrink-0" />
                    <span>{isFa ? 'بازگردانی (Undo)' : 'Undo'}</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={isUndoing}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer disabled:opacity-50"
              title={isFa ? 'بستن' : 'Dismiss'}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
