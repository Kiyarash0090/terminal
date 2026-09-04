import React, { useEffect } from 'react';
import { Trash2, AlertTriangle, X, RefreshCw } from 'lucide-react';
import { Language } from '../types';

export interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  description?: string;
  itemName?: string;
  itemType?: 'file' | 'folder' | 'items' | 'config' | 'package' | 'process' | 'row' | string;
  count?: number;
  isLoading?: boolean;
  lang?: Language;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  itemName,
  itemType,
  count,
  isLoading = false,
  lang = 'fa'
}) => {
  const isFa = lang === 'fa';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const defaultTitle = isFa ? 'تایید نهایی حذف' : 'Confirm Deletion';
  const defaultDescription = isFa
    ? 'آیا از حذف این مورد اطمینان دارید؟ این اطلاعات به صورت کامل پاک خواهند شد و قابل بازگشت نیستند.'
    : 'Are you sure you want to delete this item? This action is permanent and cannot be undone.';

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 transition-all animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
    >
      <div className="bg-white dark:bg-[#18181b] border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden transform transition-all animate-scaleUp">
        {/* Top Accent Line */}
        <div className="h-1.5 w-full bg-gradient-to-r from-rose-500 via-red-500 to-amber-500" />

        <div className="p-4 sm:p-6 space-y-4">
          {/* Header section with Icon & Close */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 sm:p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 shrink-0 shadow-inner">
                <Trash2 className="h-6 w-6 sm:h-7 sm:w-7" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-neutral-100 leading-snug">
                  {title || defaultTitle}
                </h3>
                <p className="text-[11px] sm:text-xs text-rose-500 font-semibold flex items-center gap-1 mt-0.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{isFa ? 'عملیات غیرقابل بازگشت' : 'Permanent Action'}</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="p-1.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition cursor-pointer disabled:opacity-50"
              title={isFa ? 'بستن' : 'Close'}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Description */}
          <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
            {description || defaultDescription}
          </p>

          {/* Item Name / Target Details */}
          {(itemName || (count !== undefined && count > 0)) && (
            <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800/80 space-y-1 text-right">
              <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 dark:text-neutral-500 dir-ltr text-left">
                {itemType ? `${itemType.toUpperCase()} TO DELETE` : 'ITEM TO DELETE'}
              </div>
              <div className="font-mono text-xs sm:text-sm font-bold text-neutral-900 dark:text-amber-400 break-all dir-ltr text-left">
                {count !== undefined && count > 0 ? `${count} ${isFa ? 'مورد انتخاب‌شده' : 'selected items'}` : itemName}
              </div>
            </div>
          )}

          {/* Action Buttons - Mobile Touch Friendly (min-height 44px) */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs sm:text-sm font-semibold transition cursor-pointer disabled:opacity-50 min-h-[44px] flex items-center justify-center"
            >
              {isFa ? 'انصراف' : 'Cancel'}
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-600/25 disabled:opacity-50 min-h-[44px]"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
                  <span>{isFa ? 'در حال حذف...' : 'Deleting...'}</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 shrink-0" />
                  <span>{isFa ? 'بله، حذف شود' : 'Yes, Delete'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
