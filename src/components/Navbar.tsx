import React, { useState, useEffect } from 'react';
import { Sun, Moon, Languages, LogOut, Shield, Wifi, User as UserIcon, BookOpen, Bot, Menu, X } from 'lucide-react';
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

  // Close mobile menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };
    if (isMobileMenuOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

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
      <header className="sticky top-0 z-30 h-12 sm:h-14 md:h-16 border-b border-neutral-200 dark:border-white/10 bg-white/90 dark:bg-[#0A0A0B]/80 backdrop-blur-md px-2.5 sm:px-4 md:px-6 flex items-center justify-between transition-colors">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="h-7 w-7 sm:h-9 sm:w-9 md:h-10 md:w-10 rounded-lg sm:rounded-xl overflow-hidden border border-emerald-500/30 shadow-lg shadow-emerald-500/10 bg-neutral-900 shrink-0">
            <img src={avatarImg} alt="Terminal Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h1 className="font-bold text-xs sm:text-sm md:text-base leading-tight tracking-tight text-neutral-900 dark:text-white">
              {t.appTitle}
            </h1>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 hidden sm:block">
              {t.appSubTitle}
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 mr-2">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
            <Wifi className="h-3.5 w-3.5" />
            <span>{t.serverOnline}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Telegram Bot Button */}
          <button
            onClick={onOpenTelegramBot}
            className="relative px-2 py-1.5 sm:px-3 sm:py-1.5 text-sky-600 dark:text-sky-400 rounded-lg sm:rounded-xl bg-sky-500/10 dark:bg-sky-500/15 border border-sky-500/30 hover:bg-sky-500/20 transition flex items-center gap-1.5 sm:gap-2 cursor-pointer shadow-sm active:scale-95 text-xs font-semibold"
            title={
              lang === 'fa' 
                ? `مدیریت ربات تلگرام - وضعیت: ${botRunning ? 'روشن (فعال)' : 'خاموش'}` 
                : `Telegram Bot Manager - Status: ${botRunning ? 'Running' : 'Stopped'}`
            }
          >
            <div className="relative flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sky-500 shrink-0" />
              {/* Status Indicator Dot */}
              <span 
                className={`absolute -top-1 -right-1 h-2 w-2 rounded-full ring-2 ring-white dark:ring-[#0A0A0B] ${
                  botRunning ? 'bg-green-500 animate-pulse' : 'bg-neutral-400 dark:bg-neutral-600'
                }`}
              />
            </div>
            <span className="hidden sm:inline">{t.telegramBot}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              botRunning 
                ? 'bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30' 
                : 'bg-neutral-500/15 text-neutral-500 dark:text-neutral-400 border border-neutral-500/30'
            }`}>
              {botRunning ? (lang === 'fa' ? 'روشن' : 'ON') : (lang === 'fa' ? 'خاموش' : 'OFF')}
            </span>
          </button>

          {/* Quick Documentation & Guide Button (Desktop) */}
          <button
            onClick={onOpenDocumentation}
            className="hidden md:flex p-1.5 sm:p-2 text-indigo-600 dark:text-indigo-400 rounded-lg sm:rounded-xl bg-indigo-500/10 dark:bg-indigo-500/15 border border-indigo-500/30 hover:bg-indigo-500/20 transition items-center justify-center cursor-pointer shadow-sm active:scale-95"
            title={lang === 'fa' ? 'داکیومنت و راهنمای سریع (Shift + ?)' : 'Quick Guide & Documentation (Shift + ?)'}
          >
            <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-500" />
          </button>

          {/* Language Toggle (Desktop) */}
          <button
            onClick={onToggleLang}
            className="hidden md:flex px-2 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-medium rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition items-center gap-1 text-neutral-700 dark:text-neutral-200 cursor-pointer"
            title={t.langToggle}
          >
            <Languages className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span>{t.langToggle}</span>
          </button>

          {/* Theme Toggle (Desktop) */}
          <button
            onClick={onToggleTheme}
            className="hidden md:flex p-1.5 sm:p-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition text-neutral-700 dark:text-neutral-200 cursor-pointer"
            title={t.themeToggle}
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-400" /> : <Moon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-700" />}
          </button>

          {/* Security Settings Button (Desktop) */}
          {user && (
            <button
              onClick={onOpenSecurity}
              className="hidden md:flex px-2 py-1.5 sm:px-3 sm:py-1.5 text-xs font-semibold rounded-lg sm:rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
              title={t.securitySettings}
            >
              <Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500 shrink-0" />
              <span>{t.securitySettings}</span>
            </button>
          )}

          {/* Logout Button (Desktop) */}
          {user && (
            <div className="hidden md:flex items-center gap-1 sm:gap-2 pl-1.5 sm:pl-2 border-l border-neutral-200 dark:border-neutral-800">
              <span className="hidden lg:flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800/60">
                <UserIcon className="h-3.5 w-3.5 text-emerald-500" />
                <span>{user.username}</span>
              </span>

              <button
                onClick={onLogout}
                className="p-1.5 sm:p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200/50 dark:border-red-900/30 transition cursor-pointer"
                title={t.logout}
              >
                <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
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

