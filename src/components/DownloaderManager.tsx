import React, { useState, useEffect } from 'react';
import { Youtube, Instagram, DownloadCloud, Sparkles } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../locales/translations';
import { YouTubeManager } from './YouTubeManager';
import { InstagramManager } from './InstagramManager';

interface DownloaderManagerProps {
  token: string | null;
  lang: Language;
  isActive?: boolean;
}

export type DownloaderSubTab = 'youtube' | 'instagram';

export const DownloaderManager: React.FC<DownloaderManagerProps> = ({ token, lang, isActive = true }) => {
  const isFa = lang === 'fa';
  const t = translations[lang];

  const [subTab, setSubTab] = useState<DownloaderSubTab>(() => {
    const saved = localStorage.getItem('serverdash_downloader_tab');
    return (saved === 'youtube' || saved === 'instagram') ? saved : 'youtube';
  });

  const handleSubTabChange = (tab: DownloaderSubTab) => {
    setSubTab(tab);
    localStorage.setItem('serverdash_downloader_tab', tab);
  };

  const [clearingCache, setClearingCache] = useState(false);
  const [cacheClearSuccess, setCacheClearSuccess] = useState(false);

  const handleClearDownloaderCache = async () => {
    if (clearingCache) return;
    try {
      setClearingCache(true);
      const res = await fetch('/api/downloader/clear-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        setCacheClearSuccess(true);
        setTimeout(() => setCacheClearSuccess(false), 3000);
      }
    } catch {
      // silent
    } finally {
      setClearingCache(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Downloader Header & Segmented Tab Switcher */}
      <div className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-2xl p-3.5 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          {/* Title and description */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-rose-500/20 via-pink-500/20 to-purple-500/20 dark:from-rose-500/25 dark:via-pink-500/25 dark:to-purple-500/25 border border-rose-500/30 flex items-center justify-center shrink-0 shadow-xs">
              <DownloadCloud className="w-5 h-5 sm:w-6 sm:h-6 text-rose-500 dark:text-rose-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
                  {(t as any).downloader || (isFa ? 'دانلودر مدیا و ویدیو' : 'Media Downloader')}
                </h1>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  {subTab === 'youtube' ? 'YouTube' : 'Instagram'}
                </span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {isFa ? 'بهینه‌ساز مصرف منابع فعال' : 'Zero-Idle Active'}
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                {isFa 
                  ? 'دانلود پرسرعت ویدیو، موزیک و پست‌ها از پلتفرم‌های یوتیوب و اینستاگرام (بدون کش اضافی در حالت بیکار)' 
                  : 'Fast media downloader for YouTube & Instagram (zero idle cache)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
            {/* Quick Clear Cache & Temp Files Button */}
            <button
              type="button"
              onClick={handleClearDownloaderCache}
              disabled={clearingCache}
              className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                cacheClearSuccess
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-white/10'
              }`}
              title={isFa ? 'پاکسازی کامل کش و حافظه موقت دانلودر' : 'Clear Downloader Cache & Temp Files'}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>
                {cacheClearSuccess
                  ? (isFa ? 'کش پاک شد' : 'Cache Cleared')
                  : clearingCache
                  ? (isFa ? 'در حال پاکسازی...' : 'Clearing...')
                  : (isFa ? 'پاکسازی کش' : 'Clear Cache')}
              </span>
            </button>

            {/* Segmented Control Buttons (Mobile Optimized) */}
            <div className="grid grid-cols-2 p-1 bg-neutral-100 dark:bg-white/5 rounded-xl border border-neutral-200/80 dark:border-white/10">
              <button
                type="button"
                onClick={() => handleSubTabChange('youtube')}
                className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  subTab === 'youtube'
                    ? 'bg-white dark:bg-[#1a1a1e] text-rose-600 dark:text-rose-400 shadow-xs border border-neutral-200/60 dark:border-white/10'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Youtube className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{isFa ? 'یوتیوب' : 'YouTube'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSubTabChange('instagram')}
                className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  subTab === 'instagram'
                    ? 'bg-white dark:bg-[#1a1a1e] text-pink-600 dark:text-pink-400 shadow-xs border border-neutral-200/60 dark:border-white/10'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Instagram className="w-4 h-4 shrink-0 text-pink-500" />
                <span>{isFa ? 'اینستاگرام' : 'Instagram'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Downloader Sub-view Content - Pass isActive so polling completely stops when inactive */}
      <div>
        <div className={subTab === 'youtube' ? '' : 'hidden'}>
          <YouTubeManager lang={lang} token={token} isActive={isActive && subTab === 'youtube'} />
        </div>
        <div className={subTab === 'instagram' ? '' : 'hidden'}>
          <InstagramManager lang={lang} token={token} isActive={isActive && subTab === 'instagram'} />
        </div>
      </div>
    </div>
  );
};

export default DownloaderManager;
