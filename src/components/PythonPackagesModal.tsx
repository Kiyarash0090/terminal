import React, { useState, useEffect } from 'react';
import { Package, Trash2, Search, RefreshCw, X, Plus, AlertTriangle, CheckSquare, Square, Check, Loader2, Boxes } from 'lucide-react';
import { Language } from '../types';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface PythonPackage {
  name: string;
  version: string;
}

interface PythonPackagesModalProps {
  token: string | null;
  lang: Language;
  isOpen: boolean;
  onClose: () => void;
}

export const PythonPackagesModal: React.FC<PythonPackagesModalProps> = ({
  token,
  lang,
  isOpen,
  onClose
}) => {
  const isFa = lang === 'fa';
  const [packages, setPackages] = useState<PythonPackage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uninstalling, setUninstalling] = useState<boolean>(false);
  const [installing, setInstalling] = useState<boolean>(false);
  
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());
  
  const [newPackageName, setNewPackageName] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState<boolean>(false);

  // Custom Delete Confirm Modal State
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    uninstallAll: boolean;
    count?: number;
    pkgName?: string;
  }>({ isOpen: false, uninstallAll: false });

  const fetchPackages = async () => {
    if (!token) return;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/python/packages', {
        headers: { 'x-auth-token': token }
      });
      if (res.ok) {
        const data = await res.json();
        setPackages(data.packages || []);
        setSelectedPackages(new Set());
      } else {
        const err = await res.json().catch(() => ({}));
        setFeedback({
          type: 'error',
          message: err.error || (isFa ? 'خطا در دریافت لیست کتابخانه‌ها' : 'Failed to fetch python packages')
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: isFa ? 'خطا در ارتباط با سرور' : 'Server communication error'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPackages();
      setSearchQuery('');
      setConfirmDeleteAll(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredPackages = packages.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.version.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelectPackage = (pkgName: string) => {
    const next = new Set(selectedPackages);
    if (next.has(pkgName)) {
      next.delete(pkgName);
    } else {
      next.add(pkgName);
    }
    setSelectedPackages(next);
  };

  const toggleSelectAll = () => {
    if (selectedPackages.size === filteredPackages.length && filteredPackages.length > 0) {
      setSelectedPackages(new Set());
    } else {
      const next = new Set<string>();
      filteredPackages.forEach(p => next.add(p.name));
      setSelectedPackages(next);
    }
  };

  const handleUninstall = (uninstallAllMode: boolean = false) => {
    const targetList = uninstallAllMode ? [] : Array.from(selectedPackages);

    if (!uninstallAllMode && targetList.length === 0) {
      setFeedback({
        type: 'info',
        message: isFa ? 'لطفاً حداقل یک کتابخانه را جهت حذف انتخاب کنید' : 'Please select at least one package to uninstall'
      });
      return;
    }

    setDeleteModal({
      isOpen: true,
      uninstallAll: uninstallAllMode,
      count: targetList.length,
      pkgName: targetList.length === 1 ? targetList[0] : undefined
    });
  };

  const confirmExecuteUninstall = async () => {
    const uninstallAllMode = deleteModal.uninstallAll;
    const targetList = uninstallAllMode ? [] : Array.from(selectedPackages);

    setUninstalling(true);
    setFeedback({
      type: 'info',
      message: isFa ? 'در حال حذف کتابخانه‌های پایتون...' : 'Uninstalling Python packages...'
    });

    try {
      const res = await fetch('/api/python/packages/uninstall', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({
          packages: targetList,
          uninstallAll: uninstallAllMode
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: data.message || (isFa ? 'حذف با موفقیت انجام شد' : 'Uninstalled successfully')
        });
        setConfirmDeleteAll(false);
        fetchPackages();
      } else {
        setFeedback({
          type: 'error',
          message: data.error || (isFa ? 'خطا در حذف کتابخانه‌ها' : 'Failed to uninstall packages')
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: isFa ? 'خطا در ارتباط با سرور' : 'Server communication error'
      });
    } finally {
      setUninstalling(false);
      setDeleteModal({ isOpen: false, uninstallAll: false });
    }
  };

  const handleInstallNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPackageName.trim()) return;

    setInstalling(true);
    setFeedback({
      type: 'info',
      message: isFa ? `در حال نصب کتابخانه ${newPackageName}...` : `Installing package ${newPackageName}...`
    });

    try {
      const res = await fetch('/api/python/packages/install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({ packageName: newPackageName.trim() })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: data.message || (isFa ? 'کتابخانه با موفقیت نصب شد' : 'Package installed successfully')
        });
        setNewPackageName('');
        fetchPackages();
      } else {
        setFeedback({
          type: 'error',
          message: data.error || (isFa ? 'خطا در نصب کتابخانه' : 'Failed to install package')
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: isFa ? 'خطا در ارتباط با سرور' : 'Server error'
      });
    } finally {
      setInstalling(false);
    }
  };

  const isAllSelected = filteredPackages.length > 0 && selectedPackages.size === filteredPackages.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        dir={isFa ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="p-4 border-b border-neutral-200 dark:border-white/10 flex items-center justify-between bg-neutral-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <span>{isFa ? 'مدیریت کتابخانه‌های پایتون سرور' : 'Server Python Packages Manager'}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 font-mono font-bold">
                  {packages.length}
                </span>
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {isFa ? 'مشاهده، نصب و حذف پکیج‌های پایتون (Pip)' : 'View, install and uninstall Python pip packages'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchPackages}
              disabled={loading || uninstalling}
              className="p-2 rounded-xl border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300 transition cursor-pointer disabled:opacity-50"
              title={isFa ? 'بروزرسانی لیست' : 'Refresh list'}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Action Controls & Search */}
        <div className="p-4 space-y-3 bg-neutral-50/30 dark:bg-white/[0.01] border-b border-neutral-200 dark:border-white/10">
          {/* Quick Install Form */}
          <form onSubmit={handleInstallNew} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Package className="h-4 w-4 text-neutral-400 absolute left-3 top-2.5 dir-ltr:left-3 dir-rtl:right-3 dir-rtl:left-auto" />
              <input
                type="text"
                value={newPackageName}
                onChange={(e) => setNewPackageName(e.target.value)}
                placeholder={isFa ? 'نام کتابخانه پایتون جهت نصب (مثلاً requests یا pandas)...' : 'Python package name to install (e.g. requests)...'}
                className="w-full pl-9 pr-3 dir-rtl:pr-9 dir-rtl:pl-3 py-2 rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#18181b] text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={installing || !newPackageName.trim()}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
            >
              {installing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span>{isFa ? 'نصب پکیج' : 'Install Package'}</span>
            </button>
          </form>

          {/* Search Bar & Batch Uninstall Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <div className="relative w-full sm:w-64">
              <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-2.5 dir-rtl:right-3 dir-rtl:left-auto" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isFa ? 'جستجوی پکیج...' : 'Search package...'}
                className="w-full pl-8 pr-3 dir-rtl:pr-8 dir-rtl:pl-3 py-1.5 rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#18181b] text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:ring-1 focus:ring-purple-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => handleUninstall(false)}
                disabled={uninstalling || selectedPackages.size === 0}
                className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500 text-rose-600 dark:text-rose-400 hover:text-white transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>
                  {isFa
                    ? `حذف انتخاب‌شده‌ها (${selectedPackages.size})`
                    : `Delete Selected (${selectedPackages.size})`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleUninstall(true)}
                disabled={uninstalling || packages.length === 0}
                className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-semibold border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                title={isFa ? 'حذف تمام کتابخانه‌های اضافی پایتون' : 'Uninstall all Python packages'}
              >
                <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                <span>{isFa ? 'حذف همه' : 'Delete All'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Feedback Alert Banner */}
        {feedback && (
          <div
            className={`px-4 py-2.5 text-xs font-medium border-b flex items-center justify-between gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : feedback.type === 'error'
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {feedback.type === 'success' && <Check className="h-4 w-4 shrink-0" />}
              {feedback.type === 'error' && <AlertTriangle className="h-4 w-4 shrink-0" />}
              {feedback.type === 'info' && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
              <span className="truncate">{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Packages List Table */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[250px] max-h-[420px] scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-800">
          {loading ? (
            <div className="py-16 text-center text-neutral-400 space-y-3">
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-purple-500" />
              <p className="text-xs">{isFa ? 'در حال اسکن کتابخانه‌های پایتون سرور...' : 'Scanning installed python packages...'}</p>
            </div>
          ) : filteredPackages.length === 0 ? (
            <div className="py-16 text-center text-neutral-400 space-y-2">
              <Package className="h-10 w-10 mx-auto text-neutral-300 dark:text-neutral-700" />
              <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                {searchQuery
                  ? (isFa ? 'هیچ کتابخانه‌ای با این عبارت یافت نشد' : 'No packages matched search query')
                  : (isFa ? 'هیچ کتابخانه پایتونی نصب نشده است' : 'No Python packages installed')}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Select All Bar */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-neutral-100 dark:bg-white/5 text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 hover:text-neutral-900 dark:hover:text-white transition cursor-pointer"
                >
                  {isAllSelected ? (
                    <CheckSquare className="h-4 w-4 text-purple-500" />
                  ) : (
                    <Square className="h-4 w-4 text-neutral-400" />
                  )}
                  <span>{isFa ? 'انتخاب همه کتابخانه‌های این لیست' : 'Select All in List'}</span>
                </button>
                <span className="text-[11px] font-mono">
                  {selectedPackages.size} {isFa ? 'از' : 'of'} {filteredPackages.length} {isFa ? 'انتخاب شده' : 'selected'}
                </span>
              </div>

              {/* Package Rows */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredPackages.map((pkg) => {
                  const isSelected = selectedPackages.has(pkg.name);
                  return (
                    <div
                      key={pkg.name}
                      onClick={() => toggleSelectPackage(pkg.name)}
                      className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-3 cursor-pointer ${
                        isSelected
                          ? 'border-purple-500/50 bg-purple-500/10 dark:bg-purple-500/10'
                          : 'border-neutral-200 dark:border-white/5 bg-neutral-50/50 dark:bg-white/[0.02] hover:bg-neutral-100/60 dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="text-purple-500 shrink-0">
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-purple-500" />
                          ) : (
                            <Square className="h-4 w-4 text-neutral-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-xs text-neutral-900 dark:text-white font-mono block truncate">
                            {pkg.name}
                          </span>
                          <span className="text-[10px] text-neutral-500 font-mono block">
                            v{pkg.version}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPackages(new Set([pkg.name]));
                          setTimeout(() => handleUninstall(false), 50);
                        }}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                        title={isFa ? `حذف ${pkg.name}` : `Uninstall ${pkg.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-neutral-50 dark:bg-white/[0.02] border-t border-neutral-200 dark:border-white/10 flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>{isFa ? 'محیط سرور آماده است' : 'Server Python runtime active'}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-neutral-200 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/20 text-neutral-800 dark:text-neutral-200 font-semibold transition cursor-pointer"
          >
            {isFa ? 'بستن' : 'Close'}
          </button>
        </div>

        {/* Custom Delete Confirmation Modal */}
        <DeleteConfirmModal
          isOpen={deleteModal.isOpen}
          onClose={() => setDeleteModal({ isOpen: false, uninstallAll: false })}
          onConfirm={confirmExecuteUninstall}
          isLoading={uninstalling}
          lang={lang}
          itemName={deleteModal.pkgName}
          itemType={deleteModal.uninstallAll ? (isFa ? 'همه پکیج‌ها' : 'All Packages') : (isFa ? 'پکیج پایتون' : 'Python Package')}
          count={deleteModal.uninstallAll ? packages.length : deleteModal.count}
          title={isFa ? 'تایید حذف کتابخانه پایتون' : 'Confirm Package Uninstall'}
          description={
            deleteModal.uninstallAll
              ? (isFa ? 'آیا از حذف تمامی کتابخانه‌های پایتون غیرضروری سرور مطمئن هستید؟ (پکیج‌های سیستمی اصلی حفظ می‌شوند)' : 'Are you sure you want to uninstall ALL non-essential Python packages?')
              : (isFa ? `آیا از حذف ${deleteModal.count || 1} کتابخانه انتخاب‌شده اطمینان دارید؟` : `Are you sure you want to uninstall ${deleteModal.count || 1} selected package(s)?`)
          }
        />
      </div>
    </div>
  );
};
