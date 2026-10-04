import React, { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Languages, LogOut, Shield, User as UserIcon, BookOpen, Bot, Menu, X, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Language, ThemeMode, User } from '../types';
import { translations } from '../locales/translations';

const avatarImg = '/terminal_avatar.jpg';

interface NavbarProps {
  user: User | null;
  lang: Language;
  theme: ThemeMode;
  token?: string | null;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onOpenSecurity: () => void;
  onOpenDocumentation: () => void;
  onOpenTelegramBot: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  lang,
  theme,
  token,
  onToggleLang,
  onToggleTheme,
  onOpenSecurity,
  onOpenDocumentation,
  onOpenTelegramBot,
  onLogout
}) => {
  const t = translations[lang];
  const [botRunning, setBotRunning] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState<boolean>(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  const isRtl = lang === 'fa';
  const slideInitialX = isRtl ? '-100%' : '100%';
  const itemInitialX = isRtl ? -20 : 20;

  // Close mobile drawer on window resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close mobile menu and profile dropdown on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
        setIsProfileDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    };
    if (isProfileDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProfileDropdownOpen]);

  useEffect(() => {
    if (!token) return;
    const checkBotStatus = async () => {
      try {
        const resp = await fetch('/api/telegram-bot/status', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (resp.ok && resp.headers.get('content-type')?.includes('application/json')) {
          const data = await resp.json();
          setBotRunning(Boolean(data.isRunning));
        }
      } catch {
        // ignore
      }
    };

    checkBotStatus();
    const interval = setInterval(checkBotStatus, 3500);
    return () => clearInterval(interval);
  }, [token]);

  const handleAction = (action: () => void) => {
    setIsMobileMenuOpen(false);
    action();
  };

  return (
    <>
      <header className="sticky top-0 z-30 h-13 sm:h-14 md:h-15 border-b border-neutral-200/80 dark:border-white/5 bg-white/95 dark:bg-[#09090b]/90 backdrop-blur-md px-3 sm:px-4 md:px-6 flex items-center justify-between transition-colors">
        {/* Left Side: Brand Logo & Title */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl overflow-hidden border border-emerald-500/25 shadow-xs bg-neutral-900 shrink-0">
            <img src={avatarImg} alt="Terminal Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-xs sm:text-sm md:text-[15px] leading-tight text-neutral-900 dark:text-white truncate">
              {t.appTitle}
            </h1>
            <p className="text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 truncate hidden sm:block">
              {t.appSubTitle}
            </p>
          </div>
        </div>

        {/* Right Side: Minimal Action Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Telegram Bot Button */}
          <button
            onClick={onOpenTelegramBot}
            className="px-2.5 py-1.5 text-sky-600 dark:text-sky-400 rounded-lg sm:rounded-xl bg-sky-500/10 hover:bg-sky-500/15 dark:bg-sky-500/10 dark:hover:bg-sky-500/20 border border-sky-500/25 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 text-xs font-semibold"
            title={
              lang === 'fa' 
                ? `مدیریت ربات تلگرام - وضعیت: ${botRunning ? 'روشن (فعال)' : 'خاموش'}` 
                : `Telegram Bot Manager - Status: ${botRunning ? 'Running' : 'Stopped'}`
            }
          >
            <div className="relative flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sky-500 shrink-0" />
              <span 
                className={`absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-2 ring-white dark:ring-[#09090b] ${
                  botRunning ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400 dark:bg-neutral-600'
                }`}
              />
            </div>
            <span className="hidden sm:inline">{t.telegramBot}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
              botRunning 
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' 
                : 'bg-neutral-500/15 text-neutral-500 dark:text-neutral-400 border border-neutral-500/30'
            }`}>
              {botRunning ? (lang === 'fa' ? 'روشن' : 'ON') : (lang === 'fa' ? 'خاموش' : 'OFF')}
            </span>
          </button>

          {/* Theme Toggle (Desktop) */}
          <button
            onClick={onToggleTheme}
            className="hidden md:flex p-1.5 sm:p-2 rounded-lg sm:rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200/80 dark:hover:bg-white/10 transition-all text-neutral-700 dark:text-neutral-200 cursor-pointer active:scale-95"
            title={t.themeToggle}
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-400" /> : <Moon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-700" />}
          </button>

          {/* Language Toggle (Desktop) */}
          <button
            onClick={onToggleLang}
            className="hidden md:flex px-2.5 py-1.5 text-xs font-medium rounded-lg sm:rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200/80 dark:hover:bg-white/10 transition-all items-center gap-1.5 text-neutral-700 dark:text-neutral-200 cursor-pointer active:scale-95"
            title={t.langToggle}
          >
            <Languages className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
            <span>{lang === 'fa' ? 'FA' : 'EN'}</span>
          </button>

          {/* User Profile Dropdown (Desktop) */}
          {user && (
            <div className="relative hidden md:block" ref={profileDropdownRef}>
              <button
                type="button"
                onClick={() => setIsProfileDropdownOpen(prev => !prev)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${
                  isProfileDropdownOpen
                    ? 'bg-neutral-100 dark:bg-white/10 border-neutral-300 dark:border-white/20 shadow-xs'
                    : 'bg-neutral-100/80 hover:bg-neutral-200/80 dark:bg-white/5 dark:hover:bg-white/10 border-neutral-200 dark:border-white/10'
                }`}
                title={lang === 'fa' ? 'پروفایل کاربری و تنظیمات' : 'User Profile & Settings'}
              >
                <div className="h-6 w-6 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0">
                  <UserIcon className="h-3.5 w-3.5" />
                </div>
                <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 max-w-[100px] truncate">
                  {user.username}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-neutral-400 transition-transform duration-200 ${isProfileDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu Modal / Popover */}
              <AnimatePresence>
                {isProfileDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className={`absolute z-50 mt-2 w-64 rounded-2xl bg-white dark:bg-[#141417] border border-neutral-200 dark:border-white/10 shadow-2xl p-2 ${
                      isRtl ? 'left-0' : 'right-0'
                    }`}
                  >
                    {/* User Header Info Card */}
                    <div className="p-3 bg-neutral-50 dark:bg-white/5 rounded-xl border border-neutral-100 dark:border-white/5 mb-1.5 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-500 font-bold shrink-0 shadow-2xs">
                        <UserIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-neutral-900 dark:text-white truncate">
                            {user.username}
                          </span>
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                            {user.role || (lang === 'fa' ? 'مدیر سیستم' : 'Admin')}
                          </span>
                          <span className="text-[10px] text-neutral-400 truncate">
                            {lang === 'fa' ? 'فعال' : 'Active'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Menu Items */}
                    <div className="space-y-1">
                      {/* Security Settings */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileDropdownOpen(false);
                          onOpenSecurity();
                        }}
                        className="w-full px-3 py-2.5 rounded-xl flex items-center gap-2.5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition text-start cursor-pointer group"
                      >
                        <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/20 transition shrink-0">
                          <Shield className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-xs text-neutral-900 dark:text-white">
                            {t.securitySettings}
                          </div>
                          <div className="text-[10px] text-neutral-400 truncate">
                            {lang === 'fa' ? 'تغییر رمز عبور و تنظیمات امنیتی' : 'Change password & security'}
                          </div>
                        </div>
                      </button>

                      {/* Documentation */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileDropdownOpen(false);
                          onOpenDocumentation();
                        }}
                        className="w-full px-3 py-2.5 rounded-xl flex items-center gap-2.5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition text-start cursor-pointer group"
                      >
                        <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 group-hover:bg-indigo-500/20 transition shrink-0">
                          <BookOpen className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-xs text-neutral-900 dark:text-white">
                            {t.documentation}
                          </div>
                          <div className="text-[10px] text-neutral-400 truncate">
                            {lang === 'fa' ? 'راهنما و مستندات سیستم (Shift + ?)' : 'Documentation & guide'}
                          </div>
                        </div>
                      </button>

                      <div className="h-px bg-neutral-200/70 dark:bg-white/10 my-1" />

                      {/* Logout Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileDropdownOpen(false);
                          onLogout();
                        }}
                        className="w-full px-3 py-2.5 rounded-xl flex items-center gap-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition text-start cursor-pointer group"
                      >
                        <div className="p-1.5 rounded-lg bg-rose-500/15 text-rose-500 group-hover:bg-rose-500/25 transition shrink-0">
                          <LogOut className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-xs text-rose-600 dark:text-rose-400">
                            {t.logout}
                          </div>
                          <div className="text-[10px] text-rose-400/80 truncate">
                            {lang === 'fa' ? 'خروج امن از حساب کاربری' : 'Secure logout'}
                          </div>
                        </div>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Mobile Hamburger Menu Toggle Button */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="flex md:hidden p-2 rounded-lg sm:rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer"
            aria-label="منوی دسترسی سریع"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={isMobileMenuOpen ? 'close' : 'menu'}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {isMobileMenuOpen ? <X className="h-5 w-5 text-emerald-500" /> : <Menu className="h-5 w-5 text-neutral-700 dark:text-neutral-200" />}
              </motion.div>
            </AnimatePresence>
          </motion.button>
        </div>
      </header>

      {/* Mobile Drawer Backdrop & Slide-Over Panel */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsMobileMenuOpen(false)}
            />

            {/* Drawer Container - Positioned according to LTR / RTL direction */}
            <motion.div
              initial={{ x: slideInitialX }}
              animate={{ x: 0 }}
              exit={{ x: slideInitialX }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              dir={isRtl ? 'rtl' : 'ltr'}
              className={`fixed top-0 bottom-0 z-50 w-72 sm:w-80 max-w-[85vw] h-full bg-white dark:bg-[#121215] shadow-2xl flex flex-col justify-between p-4 sm:p-5 ${
                isRtl ? 'left-0 border-r border-neutral-200 dark:border-neutral-800/80' : 'right-0 border-l border-neutral-200 dark:border-neutral-800/80'
              }`}
            >
              {/* Top Bar inside Drawer */}
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-500 font-bold text-sm">
                      <UserIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-[11px] text-neutral-400 block">{lang === 'fa' ? 'کاربر جاری:' : 'Current User:'}</span>
                      <span className="text-sm font-bold text-neutral-900 dark:text-white">
                        {user ? user.username : (lang === 'fa' ? 'مهمان' : 'Guest')}
                      </span>
                    </div>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </motion.button>
                </div>

                {/* Navigation Items */}
                <div className="mt-4 space-y-2">
                  {/* 1. Security Settings */}
                  {user && (
                    <motion.button
                      initial={{ opacity: 0, x: itemInitialX }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05, duration: 0.2 }}
                      onClick={() => handleAction(onOpenSecurity)}
                      className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-medium text-xs hover:bg-emerald-500/20 transition cursor-pointer active:scale-98"
                    >
                      <div className="flex items-center gap-2.5">
                        <Shield className="h-4 w-4 text-emerald-500 shrink-0" />
                        <span>{t.securitySettings}</span>
                      </div>
                    </motion.button>
                  )}

                  {/* 2. Documentation */}
                  <motion.button
                    initial={{ opacity: 0, x: itemInitialX }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1, duration: 0.2 }}
                    onClick={() => handleAction(onOpenDocumentation)}
                    className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/15 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-medium text-xs hover:bg-indigo-500/20 transition cursor-pointer active:scale-98"
                  >
                    <div className="flex items-center gap-2.5">
                      <BookOpen className="h-4 w-4 text-indigo-500 shrink-0" />
                      <span>{t.documentation}</span>
                    </div>
                  </motion.button>

                  {/* 3. Theme Mode Toggle */}
                  <motion.button
                    initial={{ opacity: 0, x: itemInitialX }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15, duration: 0.2 }}
                    onClick={() => handleAction(onToggleTheme)}
                    className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 text-neutral-800 dark:text-neutral-200 font-medium text-xs hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer active:scale-98"
                  >
                    <div className="flex items-center gap-2.5">
                      {theme === 'dark' ? (
                        <Sun className="h-4 w-4 text-amber-400 shrink-0" />
                      ) : (
                        <Moon className="h-4 w-4 text-slate-700 dark:text-slate-300 shrink-0" />
                      )}
                      <span>{t.themeToggle}</span>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
                      {theme === 'dark' ? (lang === 'fa' ? 'حالت شب' : 'Dark') : (lang === 'fa' ? 'حالت روز' : 'Light')}
                    </span>
                  </motion.button>

                  {/* 4. Language Toggle */}
                  <motion.button
                    initial={{ opacity: 0, x: itemInitialX }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2, duration: 0.2 }}
                    onClick={() => handleAction(onToggleLang)}
                    className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 text-neutral-800 dark:text-neutral-200 font-medium text-xs hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer active:scale-98"
                  >
                    <div className="flex items-center gap-2.5">
                      <Languages className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>{lang === 'fa' ? 'تغییر زبان به انگلیسی' : 'Change Language to Persian'}</span>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                      {t.langToggle}
                    </span>
                  </motion.button>
                </div>
              </div>

              {/* Bottom Section inside Drawer: Logout */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="pt-4 border-t border-neutral-200 dark:border-neutral-800"
              >
                {user && (
                  <button
                    onClick={() => handleAction(onLogout)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 dark:bg-red-500/15 border border-red-500/30 text-red-600 dark:text-red-400 font-bold text-xs hover:bg-red-500/20 transition cursor-pointer active:scale-95"
                  >
                    <LogOut className="h-4 w-4 text-red-500" />
                    <span>{t.logout}</span>
                  </button>
                )}
              </motion.div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

